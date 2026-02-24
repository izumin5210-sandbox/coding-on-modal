import type { SessionRecord } from "@/lib/session-types";

export type SessionChatUiMessageRole = "user" | "assistant" | "system";

export type SessionChatUiMessageKind =
  | "message"
  | "tool_summary"
  | "result"
  | "error";

export type SessionChatUiMessage = {
  id: string;
  role: SessionChatUiMessageRole;
  kind: SessionChatUiMessageKind;
  content: string;
  createdAt: string;
  updatedAt: string;
  rawType?: string;
  rawSubtype?: string;
  metadata?: Record<string, unknown>;
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
  messages: SessionChatUiMessage[];
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
  appendedMessages: SessionChatUiMessage[];
  appendedRawCount: number;
  run: SessionChatRunSummary;
};
