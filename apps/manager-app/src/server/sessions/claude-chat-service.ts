import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { resumeHook, start } from "workflow/api";
import type {
  AgentMessage,
  AgentMessageMetadata,
  AgentMessagePart,
  GetSessionChatResponse,
  SendSessionChatMessageInput,
  SendSessionChatMessageResponse,
  SessionChatPendingUserInput,
  SessionChatPendingUserInputQuestion,
  SubmitSessionChatUserInputResponse,
} from "@/lib/session-chat-types";
import type { AppDb } from "@/server/db";
import { getEnv } from "@/server/env";
import {
  acquireClaudeChatThreadRunLock,
  type ClaudeChatRawMessageRecord,
  type ClaudeChatThreadStoreRecord,
  ensureClaudeChatThread,
  getClaudeChatThreadBySessionId,
  listClaudeChatRawMessages,
} from "@/server/sessions/claude-chat-store";
import {
  approvalHookToken,
  sessionChatTurnWorkflow,
} from "@/server/sessions/claude-chat-workflow";
import {
  getSessionRecord,
  resolveBrokerTunnelUrl,
  SessionError,
} from "@/server/sessions/service";
import { getSession } from "@/server/sessions/store";

type SdkEnvelope = {
  id: string;
  createdAt: string;
  updatedAt: string;
  message: SDKMessage;
};

type IntermediateDynamicToolPart =
  | {
      type: "dynamic-tool";
      toolName: string;
      toolCallId: string;
      title?: string;
      providerExecuted?: boolean;
      state: "input-streaming";
      input: unknown | undefined;
    }
  | {
      type: "dynamic-tool";
      toolName: string;
      toolCallId: string;
      title?: string;
      providerExecuted?: boolean;
      state: "input-available";
      input: unknown;
    }
  | {
      type: "dynamic-tool";
      toolName: string;
      toolCallId: string;
      title?: string;
      providerExecuted?: boolean;
      state: "output-available";
      input: unknown;
      output: unknown;
      preliminary?: boolean;
    }
  | {
      type: "dynamic-tool";
      toolName: string;
      toolCallId: string;
      title?: string;
      providerExecuted?: boolean;
      state: "output-error";
      input: unknown;
      errorText: string;
    }
  | {
      type: "dynamic-tool";
      toolName: string;
      toolCallId: string;
      title?: string;
      providerExecuted?: boolean;
      state: "output-denied";
      input: unknown;
      approval: {
        id: string;
        approved: false;
        reason?: string;
      };
    };

type IntermediateMessagePart =
  | {
      type: "text";
      text: string;
    }
  | IntermediateDynamicToolPart
  | {
      type: "tool-call";
      toolUseId: string;
      toolName?: string;
      input?: unknown;
    }
  | {
      type: "tool-result";
      toolUseId?: string;
      result?: unknown;
      isError?: boolean;
    }
  | {
      type: "tool-progress";
      toolUseId: string;
      toolName: string;
      elapsedSeconds: number;
    }
  | {
      type: "tool-summary";
      summary: string;
      precedingToolUseIds: string[];
    }
  | {
      type: "result";
      subtype: string;
      isError: boolean;
      summaryText: string;
      metrics?: {
        durationMs?: number;
        durationApiMs?: number;
        numTurns?: number;
        totalCostUsd?: number;
      };
    }
  | {
      type: "status";
      subtype: string;
      data: Record<string, unknown>;
    }
  | {
      type: "file-batch";
      files: { filename: string; fileId: string }[];
      failed: { filename: string; error: string }[];
      processedAt?: string;
    }
  | {
      type: "stream-event";
      eventType?: string;
      data: unknown;
    }
  | {
      type: "error";
      message: string;
      code?: string;
    }
  | {
      type: "unknown";
      rawType: string;
      rawSubtype?: string;
      data: unknown;
    };

type IntermediateMessage = {
  id: string;
  role: AgentMessage["role"];
  parts: IntermediateMessagePart[];
  createdAt: string;
  updatedAt: string;
  metadata?: AgentMessageMetadata;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function getBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function omitKeys(
  record: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> {
  const entries = Object.entries(record).filter(([key]) => !keys.includes(key));
  return Object.fromEntries(entries);
}

function compactMetadata(
  metadata: AgentMessageMetadata,
): AgentMessageMetadata | undefined {
  const entries = Object.entries(metadata).filter(
    ([, value]) => value !== undefined,
  );
  if (entries.length === 0) {
    return undefined;
  }
  return Object.fromEntries(entries) as AgentMessageMetadata;
}

function mergeMetadata(
  base: AgentMessageMetadata,
  extra?: AgentMessageMetadata,
): AgentMessageMetadata | undefined {
  return compactMetadata({
    ...base,
    ...extra,
  });
}

function createMessage(
  envelope: SdkEnvelope,
  role: AgentMessage["role"],
  parts: IntermediateMessagePart[],
  metadata?: AgentMessageMetadata,
): IntermediateMessage {
  return {
    id: envelope.id,
    role,
    parts:
      parts.length > 0
        ? parts
        : [
            {
              type: "unknown",
              rawType:
                getString(
                  (envelope.message as unknown as Record<string, unknown>).type,
                ) ?? "unknown",
              rawSubtype: getString(
                (envelope.message as unknown as Record<string, unknown>)
                  .subtype,
              ),
              data: envelope.message,
            },
          ],
    createdAt: envelope.createdAt,
    updatedAt: envelope.updatedAt,
    metadata,
  };
}

function buildProviderMetadata(envelope: SdkEnvelope): AgentMessageMetadata {
  const raw = envelope.message as unknown as Record<string, unknown>;
  return {
    provider: "claude-agent-sdk",
    providerMessageType: getString(raw.type),
    providerSubtype: getString(raw.subtype),
    providerUuid: getString(raw.uuid),
    providerSessionId: getString(raw.session_id),
    rawStoredMessageId: envelope.id,
    parentToolUseId:
      "parent_tool_use_id" in raw
        ? (getString(raw.parent_tool_use_id) ?? null)
        : undefined,
    isSynthetic: "isSynthetic" in raw ? getBoolean(raw.isSynthetic) : undefined,
    isReplay: raw.isReplay === true,
  };
}

function toUiThread(thread: ClaudeChatThreadStoreRecord) {
  return thread;
}

function parseStoredSdkMessages(rows: ClaudeChatRawMessageRecord[]): {
  envelopes: SdkEnvelope[];
  invalidMessages: IntermediateMessage[];
} {
  const envelopes: SdkEnvelope[] = [];
  const invalidMessages: IntermediateMessage[] = [];

  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.sdkMessageJson) as SDKMessage;
      envelopes.push({
        id: row.id,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        message: parsed,
      });
    } catch (error) {
      invalidMessages.push({
        id: row.id,
        role: "system",
        parts: [
          {
            type: "error",
            code: "invalid_json",
            message: `Invalid stored SDK message JSON: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        metadata: {
          provider: "claude-agent-sdk",
          rawStoredMessageId: row.id,
          visibility: "trace",
          status: "error",
          label: "Stored Message Parse Error",
        },
      });
    }
  }

  return { envelopes, invalidMessages };
}

function normalizeContentBlocks(blocks: unknown): IntermediateMessagePart[] {
  if (!Array.isArray(blocks)) {
    return [];
  }

  const parts: IntermediateMessagePart[] = [];

  for (const block of blocks) {
    if (!isRecord(block)) {
      parts.push({ type: "unknown", rawType: "non_object_block", data: block });
      continue;
    }

    const blockType = getString(block.type) ?? "unknown";

    if (blockType === "text") {
      const text = getString(block.text) ?? getString(block.content);
      if (text?.trim()) {
        parts.push({ type: "text", text: text.trim() });
      }
      continue;
    }

    if (blockType === "tool_use") {
      const toolUseId =
        getString(block.id) ?? getString(block.tool_use_id) ?? "unknown";
      parts.push({
        type: "tool-call",
        toolUseId,
        toolName: getString(block.name),
        input: block.input,
      });
      continue;
    }

    if (blockType === "tool_result") {
      parts.push({
        type: "tool-result",
        toolUseId: getString(block.tool_use_id),
        result: "content" in block ? block.content : block,
        isError: getBoolean(block.is_error),
      });
      continue;
    }

    parts.push({
      type: "unknown",
      rawType: blockType,
      data: block,
    });
  }

  return parts;
}

function normalizeMessageParamToParts(
  messageParam: unknown,
): IntermediateMessagePart[] {
  if (typeof messageParam === "string") {
    const text = messageParam.trim();
    return text ? [{ type: "text", text }] : [];
  }

  if (!isRecord(messageParam)) {
    return [
      { type: "unknown", rawType: "user_message_param", data: messageParam },
    ];
  }

  if (typeof messageParam.content === "string") {
    const text = messageParam.content.trim();
    return text ? [{ type: "text", text }] : [];
  }

  if (Array.isArray(messageParam.content)) {
    return normalizeContentBlocks(messageParam.content);
  }

  return [
    { type: "unknown", rawType: "user_message_param", data: messageParam },
  ];
}

function extractToolUseIdFromUnknown(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return getString(value.tool_use_id) ?? getString(value.toolUseId);
}

function getToolResultErrorText(result: unknown): string {
  if (typeof result === "string" && result.trim()) {
    return result;
  }
  if (isRecord(result)) {
    const message =
      getString(result.error) ??
      getString(result.message) ??
      getString(result.stderr);
    if (message?.trim()) {
      return message;
    }
  }
  return "Tool execution failed.";
}

function createDynamicToolInputPart(
  toolName: string,
  toolCallId: string,
  input: unknown,
  state: "input-available" | "input-streaming" = "input-available",
): IntermediateDynamicToolPart {
  return {
    type: "dynamic-tool",
    toolName,
    toolCallId,
    state,
    input,
  };
}

function createDynamicToolOutputPart(
  toolName: string,
  toolCallId: string,
  input: unknown,
  result: unknown,
  isError: boolean,
): IntermediateDynamicToolPart {
  if (isError) {
    return {
      type: "dynamic-tool",
      toolName,
      toolCallId,
      state: "output-error",
      input,
      errorText: getToolResultErrorText(result),
    };
  }

  return {
    type: "dynamic-tool",
    toolName,
    toolCallId,
    state: "output-available",
    input,
    output: result,
  };
}

function buildResultSummaryText(
  message: Extract<SDKMessage, { type: "result" }>,
): string {
  if (message.subtype === "success") {
    return message.result || "Claude finished successfully.";
  }
  return message.errors.join("\n") || "Claude finished with an error.";
}

function statusPartFromRecord(
  subtype: string,
  record: Record<string, unknown>,
): IntermediateMessagePart {
  return {
    type: "status",
    subtype,
    data: omitKeys(record, ["type", "subtype", "uuid", "session_id"]),
  };
}

function normalizeSdkEnvelope(envelope: SdkEnvelope): IntermediateMessage {
  const message = envelope.message;
  const baseMetadata = buildProviderMetadata(envelope);

  if (message.type === "user") {
    const parts = normalizeMessageParamToParts(message.message);
    const hasToolResultInContent = parts.some(
      (part) => part.type === "tool-result",
    );
    if (message.tool_use_result !== undefined && !hasToolResultInContent) {
      parts.unshift({
        type: "tool-result",
        toolUseId:
          message.parent_tool_use_id ??
          extractToolUseIdFromUnknown(message.tool_use_result),
        result: message.tool_use_result,
      });
    }

    const isSyntheticLike =
      message.isSynthetic === true ||
      message.parent_tool_use_id !== null ||
      message.tool_use_result !== undefined;
    const hasToolResult = parts.some((part) => part.type === "tool-result");

    const role = isSyntheticLike ? "assistant" : "user";
    return createMessage(
      envelope,
      role,
      parts,
      mergeMetadata(baseMetadata, {
        visibility: isSyntheticLike && !hasToolResult ? "trace" : "default",
        label: isSyntheticLike
          ? hasToolResult
            ? "Tool Result"
            : "Synthetic User Message"
          : undefined,
      }),
    );
  }

  if (message.type === "assistant") {
    const parts = normalizeContentBlocks(message.message.content);
    if (message.error) {
      parts.push({
        type: "error",
        code: message.error,
        message: `Assistant message error: ${message.error}`,
      });
    }
    return createMessage(
      envelope,
      "assistant",
      parts,
      mergeMetadata(baseMetadata, {
        status: message.error ? "error" : undefined,
      }),
    );
  }

  if (message.type === "tool_progress") {
    return createMessage(
      envelope,
      "assistant",
      [
        {
          type: "tool-progress",
          toolUseId: message.tool_use_id,
          toolName: message.tool_name,
          elapsedSeconds: message.elapsed_time_seconds,
        },
      ],
      mergeMetadata(baseMetadata, {
        visibility: "trace",
        status: "in-progress",
        label: "Tool Progress",
      }),
    );
  }

  if (message.type === "tool_use_summary") {
    return createMessage(
      envelope,
      "assistant",
      [
        {
          type: "tool-summary",
          summary: message.summary,
          precedingToolUseIds: message.preceding_tool_use_ids,
        },
      ],
      mergeMetadata(baseMetadata, {
        visibility: "trace",
        label: "Tool Summary",
      }),
    );
  }

  if (message.type === "result") {
    return createMessage(
      envelope,
      "system",
      [
        {
          type: "result",
          subtype: message.subtype,
          isError: message.is_error,
          summaryText: buildResultSummaryText(message),
          metrics: {
            durationMs: message.duration_ms,
            durationApiMs: message.duration_api_ms,
            numTurns: message.num_turns,
            totalCostUsd: message.total_cost_usd,
          },
        },
      ],
      mergeMetadata(baseMetadata, {
        status: message.is_error ? "error" : "done",
        label: "Run Result",
      }),
    );
  }

  if (message.type === "auth_status") {
    return createMessage(
      envelope,
      "system",
      [
        {
          type: "status",
          subtype: "auth_status",
          data: {
            isAuthenticating: message.isAuthenticating,
            output: message.output,
            error: message.error,
          },
        },
      ],
      mergeMetadata(baseMetadata, {
        visibility: "trace",
        label: "Auth Status",
      }),
    );
  }

  if (message.type === "stream_event") {
    const eventType = isRecord(message.event)
      ? getString(message.event.type)
      : undefined;
    return createMessage(
      envelope,
      "assistant",
      [
        {
          type: "stream-event",
          eventType,
          data: message.event,
        },
      ],
      mergeMetadata(baseMetadata, {
        visibility: "trace",
        label: "Stream Event",
      }),
    );
  }

  if (message.type === "system") {
    if (message.subtype === "files_persisted") {
      return createMessage(
        envelope,
        "system",
        [
          {
            type: "file-batch",
            files: message.files.map((file) => ({
              filename: file.filename,
              fileId: file.file_id,
            })),
            failed: message.failed.map((file) => ({
              filename: file.filename,
              error: file.error,
            })),
            processedAt: message.processed_at,
          },
        ],
        mergeMetadata(baseMetadata, {
          visibility: "trace",
          label: "Files Persisted",
        }),
      );
    }

    return createMessage(
      envelope,
      "system",
      [
        statusPartFromRecord(
          message.subtype,
          message as unknown as Record<string, unknown>,
        ),
      ],
      mergeMetadata(baseMetadata, {
        visibility: "trace",
        label: `System ${message.subtype}`,
      }),
    );
  }

  return createMessage(
    envelope,
    "system",
    [
      {
        type: "unknown",
        rawType: (message as unknown as { type?: string }).type ?? "unknown",
        rawSubtype: (message as unknown as { subtype?: string }).subtype,
        data: message,
      },
    ],
    mergeMetadata(baseMetadata, {
      visibility: "trace",
      label: "Unknown SDK Message",
    }),
  );
}

function synthesizeDynamicToolParts(
  messages: IntermediateMessage[],
): IntermediateMessage[] {
  type ToolRef = {
    message: IntermediateMessage;
    partIndex: number;
  };

  const toolRefById = new Map<string, ToolRef>();
  const toolNameById = new Map<string, string>();
  const transformed: IntermediateMessage[] = [];

  for (const sourceMessage of messages) {
    const message: IntermediateMessage = {
      ...sourceMessage,
      parts: [],
    };
    transformed.push(message);

    for (const part of sourceMessage.parts) {
      if (part.type === "tool-call") {
        const toolName = part.toolName ?? "tool";
        const dynamicPart = createDynamicToolInputPart(
          toolName,
          part.toolUseId,
          part.input,
        );
        const partIndex = message.parts.push(dynamicPart) - 1;
        toolRefById.set(part.toolUseId, { message, partIndex });
        toolNameById.set(part.toolUseId, toolName);
        continue;
      }

      if (part.type === "tool-progress") {
        const existingRef = toolRefById.get(part.toolUseId);
        if (existingRef) {
          const current = existingRef.message.parts[existingRef.partIndex];
          if (
            current?.type === "dynamic-tool" &&
            (current.state === "input-available" ||
              current.state === "input-streaming")
          ) {
            existingRef.message.parts[existingRef.partIndex] =
              createDynamicToolInputPart(
                current.toolName,
                current.toolCallId,
                current.input,
                "input-streaming",
              );
          }
        }
        message.parts.push(part);
        continue;
      }

      if (part.type === "tool-result") {
        const toolCallId = part.toolUseId;
        const existingRef = toolCallId
          ? toolRefById.get(toolCallId)
          : undefined;

        if (toolCallId && existingRef) {
          const current = existingRef.message.parts[existingRef.partIndex];
          if (current?.type === "dynamic-tool") {
            existingRef.message.parts[existingRef.partIndex] =
              createDynamicToolOutputPart(
                current.toolName,
                current.toolCallId,
                current.input,
                part.result,
                part.isError === true,
              );
            continue;
          }
        }

        if (toolCallId) {
          const fallbackToolName = toolNameById.get(toolCallId) ?? "tool";
          message.parts.push(
            createDynamicToolOutputPart(
              fallbackToolName,
              toolCallId,
              null,
              part.result,
              part.isError === true,
            ),
          );
          continue;
        }

        message.parts.push(part);
        continue;
      }

      message.parts.push(part);
    }
  }

  return transformed.filter((message) => message.parts.length > 0);
}

function sortMessages(messages: IntermediateMessage[]): IntermediateMessage[] {
  return [...messages].sort((a, b) => {
    if (a.createdAt === b.createdAt) {
      return a.id.localeCompare(b.id);
    }
    return a.createdAt.localeCompare(b.createdAt);
  });
}

function toAgentPart(part: IntermediateMessagePart): AgentMessagePart | null {
  switch (part.type) {
    case "text":
      return part;
    case "dynamic-tool":
      return part;
    case "tool-progress":
      return {
        type: "data-tool_progress",
        data: {
          toolUseId: part.toolUseId,
          toolName: part.toolName,
          elapsedSeconds: part.elapsedSeconds,
        },
      };
    case "tool-summary":
      return {
        type: "data-tool_summary",
        data: {
          summary: part.summary,
          precedingToolUseIds: part.precedingToolUseIds,
        },
      };
    case "result":
      return {
        type: "data-run_result",
        data: {
          subtype: part.subtype,
          isError: part.isError,
          summaryText: part.summaryText,
          metrics: part.metrics,
        },
      };
    case "status":
      return {
        type: "data-status_event",
        data: {
          subtype: part.subtype,
          data: part.data,
        },
      };
    case "file-batch":
      return {
        type: "data-file_batch",
        data: {
          files: part.files,
          failed: part.failed,
          processedAt: part.processedAt,
        },
      };
    case "stream-event":
      return {
        type: "data-stream_event",
        data: {
          eventType: part.eventType,
          data: part.data,
        },
      };
    case "error":
      return {
        type: "data-error_event",
        data: {
          message: part.message,
          code: part.code,
        },
      };
    case "unknown":
      return {
        type: "data-unknown_event",
        data: {
          rawType: part.rawType,
          rawSubtype: part.rawSubtype,
          data: part.data,
        },
      };
    case "tool-call":
    case "tool-result":
      return null;
    default:
      return null;
  }
}

function toAgentMessage(message: IntermediateMessage): AgentMessage {
  const parts = message.parts
    .map((part) => toAgentPart(part))
    .filter((part): part is AgentMessagePart => part !== null);

  const metadata = compactMetadata({
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
    ...(message.metadata ?? {}),
  });

  return {
    id: message.id,
    role: message.role,
    parts,
    metadata,
  };
}

function toApiMessages(rows: ClaudeChatRawMessageRecord[]): AgentMessage[] {
  const { envelopes, invalidMessages } = parseStoredSdkMessages(rows);
  const normalized = envelopes.map((envelope) =>
    normalizeSdkEnvelope(envelope),
  );
  const sorted = sortMessages([...normalized, ...invalidMessages]);
  return synthesizeDynamicToolParts(sorted).map((message) =>
    toAgentMessage(message),
  );
}

type SubmitSessionClaudeChatUserInputInput = {
  toolUseId: string;
  behavior: "allow" | "deny";
  message?: string;
  answers?: Record<string, string | string[]>;
};

async function fetchBrokerPendingInput(
  providerSessionId: string,
): Promise<SessionChatPendingUserInput | null> {
  try {
    const brokerUrl = await resolveBrokerTunnelUrl(providerSessionId);
    if (!brokerUrl) return null;

    const response = await fetch(`${brokerUrl}/chat/status`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;

    const data = (await response.json()) as {
      state: string;
      pendingInput: Record<string, unknown> | null;
    };
    if (!data.pendingInput) return null;

    const pi = data.pendingInput;
    const kind = pi.kind as string;
    const toolUseId = pi.toolUseId as string;

    const base = {
      requestId: toolUseId,
      toolName: pi.toolName as string,
      toolUseId,
      createdAt: new Date().toISOString(),
      input: (pi.input as Record<string, unknown>) ?? {},
      decisionReason: pi.decisionReason as string | undefined,
      blockedPath: pi.blockedPath as string | undefined,
      agentId: pi.agentId as string | undefined,
      suggestions: pi.suggestions as unknown[] | undefined,
    };

    if (kind === "ask-user-question" && Array.isArray(pi.questions)) {
      return {
        ...base,
        kind: "ask-user-question",
        questions: pi.questions as SessionChatPendingUserInputQuestion[],
      };
    }

    return { ...base, kind: "tool-approval" };
  } catch {
    return null;
  }
}

async function getOrCreateThreadForSession(
  db: AppDb,
  sessionId: string,
  workspacePath: string,
): Promise<ClaudeChatThreadStoreRecord> {
  const existing = getClaudeChatThreadBySessionId(db, sessionId);
  if (existing) {
    return existing;
  }

  const env = getEnv();
  return ensureClaudeChatThread(db, {
    sessionId,
    cwd: workspacePath,
    maxTurns: env.AGENT_MAX_TURNS,
  });
}

export async function getSessionClaudeChat(
  db: AppDb,
  ownerUserId: string,
  sessionId: string,
): Promise<GetSessionChatResponse> {
  const session = await getSessionRecord(db, ownerUserId, sessionId);
  const thread = await getOrCreateThreadForSession(
    db,
    sessionId,
    session.workspacePath,
  );
  const rawMessages = listClaudeChatRawMessages(db, thread.id);

  // Fetch pending input from broker when a run is active
  let pendingUserInput: SessionChatPendingUserInput | null = null;
  if (thread.isRunning) {
    const record = getSession(db, ownerUserId, sessionId);
    if (record) {
      pendingUserInput = await fetchBrokerPendingInput(
        record.providerSessionId,
      );
    }
  }

  return {
    session,
    thread: toUiThread(thread),
    messages: toApiMessages(rawMessages),
    rawCount: rawMessages.length,
    pendingUserInput,
  };
}

export async function submitSessionClaudeChatUserInput(
  db: AppDb,
  ownerUserId: string,
  sessionId: string,
  input: SubmitSessionClaudeChatUserInputInput,
): Promise<SubmitSessionChatUserInputResponse> {
  await getSessionRecord(db, ownerUserId, sessionId);
  const token = approvalHookToken(sessionId, input.toolUseId);
  await resumeHook(token, {
    behavior: input.behavior,
    message: input.message,
    answers: input.answers,
  });
  return { ok: true };
}

export async function sendSessionClaudeChatMessage(
  db: AppDb,
  ownerUserId: string,
  sessionId: string,
  input: SendSessionChatMessageInput,
): Promise<SendSessionChatMessageResponse> {
  const env = getEnv();

  const record = getSession(db, ownerUserId, sessionId);
  if (!record) {
    throw new SessionError(`Session not found: ${sessionId}`, 404);
  }
  if (record.status === "terminated") {
    throw new SessionError("Session is terminated", 409);
  }

  const prompt = input.prompt.trim();
  if (!prompt) {
    throw new SessionError("prompt must not be empty", 400);
  }

  const baseThread = await getOrCreateThreadForSession(
    db,
    sessionId,
    record.workspacePath,
  );
  const lockedThread = acquireClaudeChatThreadRunLock(db, baseThread.id);
  if (!lockedThread) {
    throw new SessionError(
      "A chat run is already in progress for this Session.",
      409,
    );
  }

  const cwd = input.cwd?.trim() || lockedThread.cwd || record.workspacePath;
  const maxTurns = Math.min(
    20,
    Math.max(1, input.maxTurns ?? lockedThread.maxTurns ?? env.AGENT_MAX_TURNS),
  );

  // Start a durable workflow for this turn (fire-and-forget)
  await start(sessionChatTurnWorkflow, [
    {
      sessionId,
      threadId: lockedThread.id,
      ownerUserId,
      providerSessionId: record.providerSessionId,
      prompt,
      cwd,
      maxTurns,
      claudeSdkSessionId: lockedThread.claudeSdkSessionId,
    },
  ]);

  return { status: "submitted" };
}
