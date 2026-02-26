/**
 * Durable workflow for a single Claude chat turn.
 *
 * One workflow run is created per user prompt. The workflow:
 * 1. Sends the prompt to the broker (POST /chat/send) via SSE
 * 2. Persists accumulated messages to DB
 * 3. If a permission_request occurs, creates an approval hook and waits
 * 4. On approval, sends to broker (POST /chat/approve) via SSE
 * 5. Repeats step 2-4 until done
 * 6. Releases the thread run lock
 */

import { createHook } from "workflow";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  appendClaudeChatRawMessages,
  releaseClaudeChatThreadRunLock,
  updateClaudeChatThread,
} from "@/server/sessions/claude-chat-store";
import { getDb } from "@/server/db";
import { resolveBrokerTunnelUrl } from "@/server/sessions/service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WorkflowParams = {
  sessionId: string;
  threadId: string;
  ownerUserId: string;
  providerSessionId: string;
  prompt: string;
  cwd: string;
  maxTurns: number;
  claudeSdkSessionId?: string;
};

type ApprovalInput = {
  behavior: "allow" | "deny";
  message?: string;
  answers?: Record<string, string | string[]>;
  updatedInput?: Record<string, unknown>;
};

type TurnStepResult =
  | { type: "done"; claudeSdkSessionId?: string; messages: SDKMessage[] }
  | {
      type: "permission_request";
      claudeSdkSessionId?: string;
      messages: SDKMessage[];
      toolUseId: string;
      pendingInfo: Record<string, unknown>;
    }
  | { type: "error"; claudeSdkSessionId?: string; messages: SDKMessage[]; error: string };

// ---------------------------------------------------------------------------
// Deterministic hook token derivation
// ---------------------------------------------------------------------------

export function approvalHookToken(sessionId: string, toolUseId: string): string {
  return `session:${sessionId}:approval:${toolUseId}`;
}

// ---------------------------------------------------------------------------
// SSE reader: connects to broker and reads events
// ---------------------------------------------------------------------------

async function readBrokerSSE(
  brokerUrl: string,
  path: string,
  body: Record<string, unknown>,
): Promise<TurnStepResult> {
  "use step";

  const response = await fetch(`${brokerUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    return { type: "error", messages: [], error: `Broker returned ${response.status}: ${text}` };
  }

  if (!response.body) {
    return { type: "error", messages: [], error: "Broker response has no body" };
  }

  const messages: SDKMessage[] = [];
  let claudeSdkSessionId: string | undefined;
  let resultType: TurnStepResult["type"] = "done";
  let permissionInfo: Record<string, unknown> | null = null;
  let permissionToolUseId = "";
  let errorMessage = "";

  // Parse SSE stream
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    let currentEvent = "";
    let currentData = "";

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7).trim();
        continue;
      }
      if (line.startsWith("data: ")) {
        currentData = line.slice(6);
        // Process completed event
        try {
          const parsed = JSON.parse(currentData) as Record<string, unknown>;

          if (currentEvent === "message") {
            messages.push(parsed as unknown as SDKMessage);
            if (!claudeSdkSessionId && typeof parsed.session_id === "string") {
              claudeSdkSessionId = parsed.session_id;
            }
          } else if (currentEvent === "permission_request") {
            resultType = "permission_request";
            permissionInfo = parsed;
            permissionToolUseId = typeof parsed.toolUseId === "string" ? parsed.toolUseId : "";
          } else if (currentEvent === "done") {
            resultType = "done";
            if (typeof parsed.claudeSdkSessionId === "string") {
              claudeSdkSessionId = parsed.claudeSdkSessionId;
            }
          } else if (currentEvent === "error") {
            resultType = "error";
            errorMessage = typeof parsed.message === "string" ? parsed.message : "Unknown broker error";
            if (typeof parsed.claudeSdkSessionId === "string") {
              claudeSdkSessionId = parsed.claudeSdkSessionId;
            }
          }
        } catch {
          // Ignore malformed SSE data
        }
        currentEvent = "";
        currentData = "";
        continue;
      }
    }
  }

  if (resultType === "permission_request") {
    return {
      type: "permission_request",
      claudeSdkSessionId,
      messages,
      toolUseId: permissionToolUseId,
      pendingInfo: permissionInfo ?? {},
    };
  }

  if (resultType === "error") {
    return { type: "error", claudeSdkSessionId, messages, error: errorMessage };
  }

  return { type: "done", claudeSdkSessionId, messages };
}

// ---------------------------------------------------------------------------
// DB persistence step
// ---------------------------------------------------------------------------

async function persistMessages(
  threadId: string,
  messages: SDKMessage[],
  claudeSdkSessionId: string | undefined,
  cwd: string,
  maxTurns: number,
  isError: boolean,
  errorMessage?: string,
): Promise<void> {
  "use step";

  const db = getDb();
  if (messages.length > 0) {
    appendClaudeChatRawMessages(
      db,
      threadId,
      messages.map((m) => JSON.stringify(m)),
    );
  }
  updateClaudeChatThread(db, threadId, {
    claudeSdkSessionId,
    cwd,
    maxTurns,
    lastError: isError ? (errorMessage ?? "Chat run failed") : undefined,
  });
}

async function releaseThreadLock(threadId: string): Promise<void> {
  "use step";

  const db = getDb();
  releaseClaudeChatThreadRunLock(db, threadId);
}

// ---------------------------------------------------------------------------
// Workflow: one turn of Claude chat
// ---------------------------------------------------------------------------

export async function sessionChatTurnWorkflow(params: WorkflowParams) {
  "use workflow";

  const brokerUrl = await resolveBrokerUrl(params.providerSessionId);
  if (!brokerUrl) {
    persistMessages(
      params.threadId,
      [],
      params.claudeSdkSessionId,
      params.cwd,
      params.maxTurns,
      true,
      "Could not resolve broker tunnel URL",
    );
    releaseThreadLock(params.threadId);
    return;
  }

  try {
    let result = await readBrokerSSE(brokerUrl, "/chat/send", {
      prompt: params.prompt,
      cwd: params.cwd,
      maxTurns: params.maxTurns,
      resume: params.claudeSdkSessionId,
    });

    // Persist messages from this segment
    persistMessages(
      params.threadId,
      result.messages,
      result.claudeSdkSessionId ?? params.claudeSdkSessionId,
      params.cwd,
      params.maxTurns,
      result.type === "error",
      result.type === "error" ? result.error : undefined,
    );

    // Approval loop
    while (result.type === "permission_request") {
      const token = approvalHookToken(params.sessionId, result.toolUseId);
      const hook = createHook<ApprovalInput>({ token });
      const approval = await hook;

      result = await readBrokerSSE(brokerUrl, "/chat/approve", {
        behavior: approval.behavior,
        message: approval.message,
        answers: approval.answers,
        updatedInput: approval.updatedInput,
      });

      // Persist messages from this segment
      persistMessages(
        params.threadId,
        result.messages,
        result.claudeSdkSessionId ?? params.claudeSdkSessionId,
        params.cwd,
        params.maxTurns,
        result.type === "error",
        result.type === "error" ? result.error : undefined,
      );
    }
  } finally {
    releaseThreadLock(params.threadId);
  }
}

// ---------------------------------------------------------------------------
// Helper step: resolve broker URL
// ---------------------------------------------------------------------------

async function resolveBrokerUrl(providerSessionId: string): Promise<string | null> {
  "use step";

  return resolveBrokerTunnelUrl(providerSessionId);
}
