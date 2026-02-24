import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type {
  GetSessionChatResponse,
  SendSessionChatMessageInput,
  SendSessionChatMessageResponse,
  SessionChatRunSummary,
  SessionChatUiMessage,
} from "@/lib/session-chat-types";
import { decryptToken } from "@/server/crypto/token";
import type { AppDb } from "@/server/db";
import { getEnv } from "@/server/env";
import {
  acquireClaudeChatThreadRunLock,
  appendClaudeChatRawMessages,
  type ClaudeChatRawMessageRecord,
  type ClaudeChatThreadStoreRecord,
  ensureClaudeChatThread,
  getClaudeChatThreadBySessionId,
  listClaudeChatRawMessages,
  releaseClaudeChatThreadRunLock,
  updateClaudeChatThread,
} from "@/server/sessions/claude-chat-store";
import { createModalClaudeSpawner } from "@/server/sessions/claude-remote-spawn";
import { getSessionRecord, SessionError } from "@/server/sessions/service";
import { getSession, updateSession } from "@/server/sessions/store";
import {
  getAuthUserById,
  getEncryptedClaudeTokenByUserId,
} from "@/server/users/store";

const LINUX_USERNAME_PATTERN = /^[a-z_][a-z0-9_-]{0,31}$/;

type SdkEnvelope = {
  id: string;
  createdAt: string;
  updatedAt: string;
  message: SDKMessage;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toUiThread(thread: ClaudeChatThreadStoreRecord) {
  return thread;
}

function resolveSessionSshUser(githubLogin: string): string {
  const normalized = githubLogin.trim();
  if (!LINUX_USERNAME_PATTERN.test(normalized)) {
    throw new SessionError(
      `GitHub login "${githubLogin}" cannot be used as Session SSH user.`,
      400,
    );
  }
  return normalized;
}

function parseStoredSdkMessages(rows: ClaudeChatRawMessageRecord[]): {
  envelopes: SdkEnvelope[];
  invalidUiMessages: SessionChatUiMessage[];
} {
  const envelopes: SdkEnvelope[] = [];
  const invalidUiMessages: SessionChatUiMessage[] = [];

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
      invalidUiMessages.push({
        id: row.id,
        role: "system",
        kind: "error",
        content: `Invalid stored SDK message JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        rawType: "invalid_json",
      });
    }
  }

  return { envelopes, invalidUiMessages };
}

function extractTextFromContent(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (!Array.isArray(value)) {
    return "";
  }

  const parts: string[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }
    if (item.type === "text" && typeof item.text === "string") {
      parts.push(item.text);
      continue;
    }
    if (typeof item.content === "string") {
      parts.push(item.content);
      continue;
    }
    if (Array.isArray(item.content)) {
      const nested = extractTextFromContent(item.content);
      if (nested) {
        parts.push(nested);
      }
    }
  }

  return parts.join("\n\n").trim();
}

function extractUserMessageText(message: SDKMessage): string {
  if (message.type !== "user") {
    return "";
  }
  const body = message.message;
  if (typeof body === "string") {
    return body.trim();
  }
  if (isRecord(body)) {
    if (typeof body.content === "string") {
      return body.content.trim();
    }
    return extractTextFromContent(body.content);
  }
  return "";
}

function extractAssistantMessageText(message: SDKMessage): string {
  if (message.type !== "assistant") {
    return "";
  }
  return extractTextFromContent(message.message.content);
}

function toUiMessageFromSdk(
  envelope: SdkEnvelope,
): SessionChatUiMessage | null {
  const { id, createdAt, updatedAt, message } = envelope;

  if (message.type === "user") {
    const text = extractUserMessageText(message);
    if (!text) {
      return null;
    }
    return {
      id,
      role: "user",
      kind: "message",
      content: text,
      createdAt,
      updatedAt,
      rawType: "user",
    };
  }

  if (message.type === "assistant") {
    const text = extractAssistantMessageText(message);
    if (!text) {
      return null;
    }
    return {
      id,
      role: "assistant",
      kind: "message",
      content: text,
      createdAt,
      updatedAt,
      rawType: "assistant",
    };
  }

  if (message.type === "tool_use_summary") {
    return {
      id,
      role: "system",
      kind: "tool_summary",
      content: message.summary,
      createdAt,
      updatedAt,
      rawType: "tool_use_summary",
    };
  }

  if (message.type === "result") {
    const isError = Boolean(message.is_error);
    const content =
      message.subtype === "success"
        ? message.result || "Claude finished successfully."
        : message.errors.join("\n") || "Claude finished with an error.";
    const metadata: Record<string, unknown> = {
      isError,
      subtype: message.subtype,
      durationMs: message.duration_ms,
      durationApiMs: message.duration_api_ms,
      numTurns: message.num_turns,
      totalCostUsd: message.total_cost_usd,
    };
    return {
      id,
      role: "system",
      kind: isError ? "error" : "result",
      content,
      createdAt,
      updatedAt,
      rawType: "result",
      rawSubtype: message.subtype,
      metadata,
    };
  }

  return null;
}

function sortUiMessages(
  messages: SessionChatUiMessage[],
): SessionChatUiMessage[] {
  return [...messages].sort((a, b) => {
    if (a.createdAt === b.createdAt) {
      return a.id.localeCompare(b.id);
    }
    return a.createdAt.localeCompare(b.createdAt);
  });
}

function toUiMessages(
  rows: ClaudeChatRawMessageRecord[],
): SessionChatUiMessage[] {
  const { envelopes, invalidUiMessages } = parseStoredSdkMessages(rows);
  const uiMessages = envelopes
    .map((envelope) => toUiMessageFromSdk(envelope))
    .filter((message): message is SessionChatUiMessage => message !== null);
  return sortUiMessages([...uiMessages, ...invalidUiMessages]);
}

function buildRunSummary(
  messages: SDKMessage[],
  fallbackError?: string,
): SessionChatRunSummary {
  const result = [...messages]
    .reverse()
    .find((message) => message.type === "result");
  if (result?.type === "result") {
    const summary: SessionChatRunSummary = {
      isError: result.is_error,
      subtype: result.subtype,
      durationMs: result.duration_ms,
      durationApiMs: result.duration_api_ms,
      numTurns: result.num_turns,
      totalCostUsd: result.total_cost_usd,
    };
    if (result.subtype !== "success") {
      summary.errorMessage = result.errors.join("\n") || fallbackError;
    }
    return summary;
  }

  return {
    isError: true,
    errorMessage:
      fallbackError ?? "Claude chat run did not produce a result message.",
  };
}

function getSessionMissingStatus(spawner: {
  state: { sessionMissing: boolean };
}) {
  return spawner.state.sessionMissing;
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

  return {
    session,
    thread: toUiThread(thread),
    messages: toUiMessages(rawMessages),
    rawCount: rawMessages.length,
  };
}

export async function sendSessionClaudeChatMessage(
  db: AppDb,
  ownerUserId: string,
  sessionId: string,
  input: SendSessionChatMessageInput,
): Promise<SendSessionChatMessageResponse> {
  const env = getEnv();
  const encryptedClaudeApiKey = getEncryptedClaudeTokenByUserId(
    db,
    ownerUserId,
  );
  if (!encryptedClaudeApiKey) {
    throw new SessionError(
      "Claude API key is not configured. Please save it before running the agent.",
      400,
    );
  }
  const apiKey = decryptToken(encryptedClaudeApiKey);

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

  const authUser = getAuthUserById(db, ownerUserId);
  if (!authUser) {
    throw new SessionError("Authentication required", 401);
  }
  const sshUser = resolveSessionSshUser(authUser.github.login);

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
  const rawSdkMessages: SDKMessage[] = [];
  let claudeSdkSessionId = lockedThread.claudeSdkSessionId;
  let runSummary: SessionChatRunSummary = { isError: true };
  let persistedThread = lockedThread;
  let persistedRows: ClaudeChatRawMessageRecord[] = [];

  const spawner = createModalClaudeSpawner({
    providerSessionId: record.providerSessionId,
    linuxUser: sshUser,
    apiKey,
    timeoutMs: env.SANDBOX_TIMEOUT_MINUTES * 60_000,
  });

  try {
    for await (const message of query({
      prompt,
      options: {
        cwd,
        maxTurns,
        resume: claudeSdkSessionId,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        spawnClaudeCodeProcess: spawner.spawnClaudeCodeProcess,
      },
    })) {
      rawSdkMessages.push(message);
      if (!claudeSdkSessionId && typeof message.session_id === "string") {
        claudeSdkSessionId = message.session_id;
      }
    }

    runSummary = buildRunSummary(rawSdkMessages);
  } catch (error) {
    if (getSessionMissingStatus(spawner)) {
      updateSession(db, ownerUserId, sessionId, { status: "terminated" });
      throw new SessionError("Session no longer exists", 409);
    }
    runSummary = buildRunSummary(
      rawSdkMessages,
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    if (rawSdkMessages.length > 0) {
      persistedRows = appendClaudeChatRawMessages(
        db,
        lockedThread.id,
        rawSdkMessages.map((message) => JSON.stringify(message)),
      );
    }

    persistedThread =
      updateClaudeChatThread(db, lockedThread.id, {
        claudeSdkSessionId,
        cwd,
        maxTurns,
        lastError: runSummary.isError
          ? (runSummary.errorMessage ?? "Chat run failed")
          : undefined,
      }) ?? lockedThread;

    persistedThread =
      releaseClaudeChatThreadRunLock(db, lockedThread.id) ?? persistedThread;
  }

  const session = await getSessionRecord(db, ownerUserId, sessionId);
  const appendedMessages = toUiMessages(persistedRows);

  return {
    session,
    thread: toUiThread(persistedThread),
    appendedMessages,
    appendedRawCount: rawSdkMessages.length,
    run: runSummary,
  };
}
