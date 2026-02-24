import type { SessionRecord } from "@/lib/session-types";

export type SessionChatMessageRole = "user" | "assistant" | "system";

export type SessionChatMessageVisibility = "default" | "trace";

export type SessionChatResultMetrics = {
  durationMs?: number;
  durationApiMs?: number;
  numTurns?: number;
  totalCostUsd?: number;
};

export type SessionChatDynamicToolPart =
  | {
      type: "dynamic-tool";
      toolName: string;
      toolCallId: string;
      title?: string;
      providerExecuted?: boolean;
      state: "input-streaming";
      input?: unknown;
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

export type SessionChatMessagePart =
  | {
      type: "text";
      text: string;
    }
  | SessionChatDynamicToolPart
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
      metrics?: SessionChatResultMetrics;
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

export type SessionChatMessageMetadata = {
  visibility?: SessionChatMessageVisibility;
  status?: "in-progress" | "done" | "error";
  label?: string;
  isReplay?: boolean;
  isSynthetic?: boolean;
  parentToolUseId?: string | null;
  provider?: "claude-agent-sdk";
  providerSessionId?: string;
  providerMessageType?: string;
  providerSubtype?: string;
  providerUuid?: string;
  rawStoredMessageId?: string;
};

export type SessionChatMessage = {
  id: string;
  role: SessionChatMessageRole;
  parts: SessionChatMessagePart[];
  createdAt: string;
  updatedAt: string;
  metadata?: SessionChatMessageMetadata;
};

export type SessionClaudeCodeThread = {
  id: string;
  sessionId: string;
  claudeSdkSessionId?: string;
  cwd: string;
  maxTurns: number;
  isRunning: boolean;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
};

export type SessionChatRunSummary = {
  isError: boolean;
  subtype?: string;
  durationMs?: number;
  durationApiMs?: number;
  numTurns?: number;
  totalCostUsd?: number;
  errorMessage?: string;
};

export type GetSessionChatResponse = {
  session: SessionRecord;
  thread: SessionClaudeCodeThread;
  messages: SessionChatMessage[];
  rawCount: number;
};

export type SendSessionChatMessageInput = {
  prompt: string;
  cwd?: string;
  maxTurns?: number;
};

export type SendSessionChatMessageResponse = {
  session: SessionRecord;
  thread: SessionClaudeCodeThread;
  appendedMessages: SessionChatMessage[];
  appendedRawCount: number;
  run: SessionChatRunSummary;
};
