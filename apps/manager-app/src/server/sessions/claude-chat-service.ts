import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type {
  GetSessionChatResponse,
  SendSessionChatMessageInput,
  SendSessionChatMessageResponse,
  SessionChatMessage,
  SessionChatMessageMetadata,
  SessionChatMessagePart,
  SessionChatRunSummary,
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
  metadata: SessionChatMessageMetadata,
): SessionChatMessageMetadata | undefined {
  const entries = Object.entries(metadata).filter(
    ([, value]) => value !== undefined,
  );
  if (entries.length === 0) {
    return undefined;
  }
  return Object.fromEntries(entries) as SessionChatMessageMetadata;
}

function mergeMetadata(
  base: SessionChatMessageMetadata,
  extra?: SessionChatMessageMetadata,
): SessionChatMessageMetadata | undefined {
  return compactMetadata({
    ...base,
    ...extra,
  });
}

function createMessage(
  envelope: SdkEnvelope,
  role: SessionChatMessage["role"],
  parts: SessionChatMessagePart[],
  metadata?: SessionChatMessageMetadata,
): SessionChatMessage {
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

function buildProviderMetadata(
  envelope: SdkEnvelope,
): SessionChatMessageMetadata {
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
  invalidMessages: SessionChatMessage[];
} {
  const envelopes: SdkEnvelope[] = [];
  const invalidMessages: SessionChatMessage[] = [];

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

function normalizeContentBlocks(blocks: unknown): SessionChatMessagePart[] {
  if (!Array.isArray(blocks)) {
    return [];
  }

  const parts: SessionChatMessagePart[] = [];

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
): SessionChatMessagePart[] {
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

function buildResultSummaryText(
  message: Extract<SDKMessage, { type: "result" }>,
): string {
  if (message.subtype === "success") {
    return message.result || "Claude finished successfully.";
  }
  return message.errors.join("\n") || "Claude finished with an error.";
}

function isCanonicalUserPromptMessage(message: SDKMessage): boolean {
  return (
    message.type === "user" &&
    message.parent_tool_use_id === null &&
    message.tool_use_result === undefined &&
    message.isSynthetic !== true
  );
}

function buildSubmittedUserPromptMessage(
  prompt: string,
  sdkSessionId: string,
): SDKMessage {
  return {
    type: "user",
    message: {
      role: "user",
      content: prompt,
    },
    parent_tool_use_id: null,
    session_id: sdkSessionId,
  } as SDKMessage;
}

function statusPartFromRecord(
  subtype: string,
  record: Record<string, unknown>,
): SessionChatMessagePart {
  return {
    type: "status",
    subtype,
    data: omitKeys(record, ["type", "subtype", "uuid", "session_id"]),
  };
}

function normalizeSdkEnvelope(envelope: SdkEnvelope): SessionChatMessage {
  const message = envelope.message;
  const baseMetadata = buildProviderMetadata(envelope);

  if (message.type === "user") {
    const parts = normalizeMessageParamToParts(message.message);
    if (message.tool_use_result !== undefined) {
      parts.unshift({
        type: "tool-result",
        toolUseId: message.parent_tool_use_id ?? undefined,
        result: message.tool_use_result,
      });
    }

    const isSyntheticLike =
      message.isSynthetic === true ||
      message.parent_tool_use_id !== null ||
      message.tool_use_result !== undefined;

    const role = isSyntheticLike ? "assistant" : "user";
    return createMessage(
      envelope,
      role,
      parts,
      mergeMetadata(baseMetadata, {
        visibility: isSyntheticLike ? "trace" : "default",
        label: isSyntheticLike
          ? "Tool Result / Synthetic User Message"
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

function sortMessages(messages: SessionChatMessage[]): SessionChatMessage[] {
  return [...messages].sort((a, b) => {
    if (a.createdAt === b.createdAt) {
      return a.id.localeCompare(b.id);
    }
    return a.createdAt.localeCompare(b.createdAt);
  });
}

function toApiMessages(
  rows: ClaudeChatRawMessageRecord[],
): SessionChatMessage[] {
  const { envelopes, invalidMessages } = parseStoredSdkMessages(rows);
  const normalized = envelopes.map((envelope) =>
    normalizeSdkEnvelope(envelope),
  );
  return sortMessages([...normalized, ...invalidMessages]);
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
    messages: toApiMessages(rawMessages),
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
    const sdkMessagesToPersist = rawSdkMessages.some((message) =>
      isCanonicalUserPromptMessage(message),
    )
      ? rawSdkMessages
      : [
          buildSubmittedUserPromptMessage(
            prompt,
            claudeSdkSessionId ?? "unknown",
          ),
          ...rawSdkMessages,
        ];

    if (sdkMessagesToPersist.length > 0) {
      persistedRows = appendClaudeChatRawMessages(
        db,
        lockedThread.id,
        sdkMessagesToPersist.map((message) => JSON.stringify(message)),
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
  const appendedMessages = toApiMessages(persistedRows);

  return {
    session,
    thread: toUiThread(persistedThread),
    appendedMessages,
    appendedRawCount: persistedRows.length,
    run: runSummary,
  };
}
