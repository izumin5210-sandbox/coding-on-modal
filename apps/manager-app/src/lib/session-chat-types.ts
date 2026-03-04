import type { UIMessage } from "ai";
import type { SessionRecord } from "@/lib/session-types";
import type {
  AgentMessageErrorEvent,
  AgentMessageEventData,
  AgentMessageEventKind,
  AgentMessageFileBatchEvent,
  AgentMessageFileBatchFailure,
  AgentMessageFileBatchFile,
  AgentMessageStatusEvent,
  AgentMessageStreamEvent,
  AgentMessageToolProgressEvent,
  AgentMessageToolSummaryEvent,
  AgentMessageUnknownEvent,
} from "./agent-message-event-types";

export type AgentMessageVisibility = "default" | "trace";

export type AgentRunMetrics = {
  durationMs?: number;
  durationApiMs?: number;
  numTurns?: number;
  totalCostUsd?: number;
};

export type AgentRunResultData = {
  subtype: string;
  isError: boolean;
  summaryText: string;
  metrics?: AgentRunMetrics;
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
  event: AgentMessageEventData;
  result: AgentRunResultData;
};

export type AgentMessage = UIMessage<
  AgentMessageMetadata,
  AgentMessageData,
  // biome-ignore lint/complexity/noBannedTypes: public contract should stay UIMessage<..., ..., {}>
  {}
>;

export type AgentMessageRole = AgentMessage["role"];

export type AgentMessagePart = AgentMessage["parts"][number];

export type AgentTextPart = Extract<AgentMessagePart, { type: "text" }>;

export type AgentReasoningPart = Extract<
  AgentMessagePart,
  { type: "reasoning" }
>;

export type AgentDynamicToolPart = Extract<
  AgentMessagePart,
  { type: "dynamic-tool" }
>;

export type AgentDataPart<TKey extends keyof AgentMessageData> = Extract<
  AgentMessagePart,
  { type: `data-${TKey}` }
>;

export type AgentEventPart = AgentDataPart<"event">;

export type AgentResultPart = AgentDataPart<"result">;

export type {
  AgentMessageErrorEvent,
  AgentMessageEventData,
  AgentMessageEventKind,
  AgentMessageFileBatchEvent,
  AgentMessageFileBatchFailure,
  AgentMessageFileBatchFile,
  AgentMessageStatusEvent,
  AgentMessageStreamEvent,
  AgentMessageToolProgressEvent,
  AgentMessageToolSummaryEvent,
  AgentMessageUnknownEvent,
};

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
