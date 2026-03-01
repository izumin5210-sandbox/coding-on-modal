import type { UIMessage } from "ai";
import type { SessionRecord } from "@/lib/session-types";

export type AgentMessageVisibility = "default" | "trace";

export type AgentRunMetrics = {
  durationMs?: number;
  durationApiMs?: number;
  numTurns?: number;
  totalCostUsd?: number;
};

export type AgentMessageMetadata = {
  createdAt?: string;
  updatedAt?: string;
  visibility?: AgentMessageVisibility;
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

export type AgentMessageData = {
  tool_progress: {
    toolUseId: string;
    toolName: string;
    elapsedSeconds: number;
  };
  tool_summary: {
    summary: string;
    precedingToolUseIds: string[];
  };
  run_result: {
    subtype: string;
    isError: boolean;
    summaryText: string;
    metrics?: AgentRunMetrics;
  };
  status_event: {
    subtype: string;
    data: Record<string, unknown>;
  };
  file_batch: {
    files: { filename: string; fileId: string }[];
    failed: { filename: string; error: string }[];
    processedAt?: string;
  };
  stream_event: {
    eventType?: string;
    data: unknown;
  };
  error_event: {
    message: string;
    code?: string;
  };
  unknown_event: {
    rawType: string;
    rawSubtype?: string;
    data: unknown;
  };
};

export type AgentMessage = UIMessage<
  AgentMessageMetadata,
  AgentMessageData,
  Record<never, never>
>;

export type AgentMessagePart = AgentMessage["parts"][number];

export type AgentDataPart<TKey extends keyof AgentMessageData> = Extract<
  AgentMessagePart,
  { type: `data-${TKey}` }
>;

export type SessionChatPendingUserInputQuestion = {
  header: string;
  question: string;
  multiSelect: boolean;
  options: {
    label: string;
    description: string;
  }[];
};

export type SessionChatPendingUserInputAnswerValue = string | string[];

export type SessionChatPendingUserInput =
  | {
      requestId: string;
      toolName: string;
      toolUseId: string;
      kind: "ask-user-question";
      createdAt: string;
      input: Record<string, unknown>;
      questions: SessionChatPendingUserInputQuestion[];
      decisionReason?: string;
      blockedPath?: string;
      agentId?: string;
      suggestions?: unknown[];
    }
  | {
      requestId: string;
      toolName: string;
      toolUseId: string;
      kind: "tool-approval";
      createdAt: string;
      input: Record<string, unknown>;
      decisionReason?: string;
      blockedPath?: string;
      agentId?: string;
      suggestions?: unknown[];
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

export type GetSessionChatResponse = {
  session: SessionRecord;
  thread: SessionClaudeCodeThread;
  messages: AgentMessage[];
  rawCount: number;
  pendingUserInput?: SessionChatPendingUserInput | null;
};

export type SendSessionChatMessageInput = {
  prompt: string;
  cwd?: string;
  maxTurns?: number;
};

export type SendSessionChatMessageResponse = {
  status: "submitted";
};

export type SubmitSessionChatUserInputResponse = {
  ok: true;
};
