import type { GqlObject, IDString, Int, NoArgs } from "@gqlkit-ts/runtime";
import type {
  GetSessionChatResponse as SharedGetSessionChatResponse,
  SessionChatPendingUserInput as SharedSessionChatPendingUserInput,
  SessionChatPendingUserInputQuestion as SharedSessionChatPendingUserInputQuestion,
  SendSessionChatMessageInput as SharedSendSessionChatMessageInput,
} from "@/lib/session-chat-types";
import {
  getSessionClaudeChat,
  sendSessionClaudeChatMessage as sendSessionClaudeChatMessageService,
  submitSessionClaudeChatUserInput as submitSessionClaudeChatUserInputService,
} from "@/server/sessions/claude-chat-service";
import { requireViewerId, toGraphQLError } from "../errors";
import { defineField, defineMutation, defineResolveType } from "../gqlkit";
import type { AgentMessage } from "./agent-message";
import { toGraphQLAgentMessage } from "./agent-message";
import type { Session } from "./session";
import type { DateTime, JsonValue } from "./scalars";

export type SessionChatThread = {
  id: IDString;
  sessionId: IDString;
  claudeSdkSessionId?: string;
  cwd: string;
  maxTurns: Int;
  isRunning: boolean;
  lastError?: string;
  createdAt: DateTime;
  updatedAt: DateTime;
};

export type SessionChatPendingUserInputQuestion = {
  header: string;
  question: string;
  multiSelect: boolean;
  options: SessionChatPendingUserInputQuestionOption[];
};

export type SessionChatPendingUserInputQuestionOption = {
  label: string;
  description: string;
};

export enum SessionChatPendingRequestKind {
  AskUserQuestion = "ask-user-question",
  ToolApproval = "tool-approval",
}

export type SessionChatAskUserQuestionPendingRequest = {
  $typeName: "SessionChatAskUserQuestionPendingRequest";
  requestId: string;
  toolName: string;
  toolUseId: string;
  kind: SessionChatPendingRequestKind;
  createdAt: DateTime;
  input: JsonValue;
  questions: SessionChatPendingUserInputQuestion[];
  decisionReason?: string;
  blockedPath?: string;
  agentId?: string;
  suggestions?: JsonValue[];
};

export type SessionChatToolApprovalPendingRequest = {
  $typeName: "SessionChatToolApprovalPendingRequest";
  requestId: string;
  toolName: string;
  toolUseId: string;
  kind: SessionChatPendingRequestKind;
  createdAt: DateTime;
  input: JsonValue;
  decisionReason?: string;
  blockedPath?: string;
  agentId?: string;
  suggestions?: JsonValue[];
};

export type SessionChatPendingRequest =
  | SessionChatAskUserQuestionPendingRequest
  | SessionChatToolApprovalPendingRequest;

export const sessionChatPendingRequestResolveType =
  defineResolveType<SessionChatPendingRequest>((value) => value.$typeName);

type SessionChatPendingUserInputPayload =
  | SessionChatAskUserQuestionPendingRequest
  | SessionChatToolApprovalPendingRequest;

export const sessionChatPendingUserInputPayloadResolveType =
  defineResolveType<SessionChatPendingUserInputPayload>(
    (value) => value.$typeName,
  );

export type SessionChat = GqlObject<
  {
    thread: SessionChatThread;
    messages: AgentMessage[];
    rawCount: Int;
    pendingRequest?: SessionChatPendingRequest | null;
    sessionId: IDString;
  },
  { ignoreFields: "pendingRequest" | "sessionId" }
>;

export type SendSessionChatMessageInput = {
  sessionId: IDString;
  prompt: string;
  cwd?: string;
  maxTurns?: Int;
};

export enum SendSessionChatMessageStatus {
  Submitted = "submitted",
}

export type SendSessionChatMessagePayload = {
  status: SendSessionChatMessageStatus;
};

export type SubmitSessionChatUserInputAnswerInput = {
  key: string;
  values: string[];
};

export type SubmitSessionChatUserInputInput = {
  sessionId: IDString;
  toolUseId: string;
  behavior: "allow" | "deny";
  message?: string;
  answers?: SubmitSessionChatUserInputAnswerInput[];
};

export type SubmitSessionChatUserInputPayload = {
  ok: boolean;
};

function toJsonValue(value: unknown): JsonValue {
  return value as JsonValue;
}

function toQuestion(
  question: SharedSessionChatPendingUserInputQuestion,
): SessionChatPendingUserInputQuestion {
  return {
    header: question.header,
    question: question.question,
    multiSelect: question.multiSelect,
    options: question.options.map((option) => ({
      label: option.label,
      description: option.description,
    })),
  };
}

function toPendingUserInput(
  pending: SharedSessionChatPendingUserInput | null | undefined,
): SessionChatPendingRequest | null {
  if (!pending) {
    return null;
  }

  const base = {
    requestId: pending.requestId,
    toolName: pending.toolName,
    toolUseId: pending.toolUseId,
    createdAt: pending.createdAt,
    input: toJsonValue(pending.input),
    decisionReason: pending.decisionReason,
    blockedPath: pending.blockedPath,
    agentId: pending.agentId,
    suggestions: pending.suggestions?.map((suggestion) => toJsonValue(suggestion)),
  };

  if (pending.kind === "ask-user-question") {
    return {
      $typeName: "SessionChatAskUserQuestionPendingRequest",
      ...base,
      kind: SessionChatPendingRequestKind.AskUserQuestion,
      questions: pending.questions.map((question) => toQuestion(question)),
    };
  }

  return {
    $typeName: "SessionChatToolApprovalPendingRequest",
    ...base,
    kind: SessionChatPendingRequestKind.ToolApproval,
  };
}

function toSessionChatThread(
  thread: SharedGetSessionChatResponse["thread"],
): SessionChatThread {
  return {
    id: thread.id,
    sessionId: thread.sessionId,
    claudeSdkSessionId: thread.claudeSdkSessionId,
    cwd: thread.cwd,
    maxTurns: thread.maxTurns as Int,
    isRunning: thread.isRunning,
    lastError: thread.lastError,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
  };
}

function toSessionChat(
  response: SharedGetSessionChatResponse,
  sessionId: string,
): SessionChat {
  return {
    sessionId,
    thread: toSessionChatThread(response.thread),
    messages: response.messages.map((message) => toGraphQLAgentMessage(message)),
    rawCount: response.rawCount as Int,
    pendingRequest: toPendingUserInput(response.pendingUserInput),
  };
}

function toSendMessageServiceInput(
  input: SendSessionChatMessageInput,
): SharedSendSessionChatMessageInput {
  return {
    prompt: input.prompt,
    cwd: input.cwd,
    maxTurns: input.maxTurns,
  };
}

function toAnswersRecord(
  answers: SubmitSessionChatUserInputAnswerInput[] | undefined,
): Record<string, string | string[]> | undefined {
  if (!answers || answers.length === 0) {
    return undefined;
  }

  return Object.fromEntries(
    answers.map((answer) => [answer.key, answer.values]),
  );
}

export const chat = defineField<Session, NoArgs, SessionChat>(
  async (parent, _args, context) => {
    try {
      const viewerId = requireViewerId(context);
      const response = await getSessionClaudeChat(context.db, viewerId, parent.id);
      return toSessionChat(response, parent.id);
    } catch (error) {
      throw toGraphQLError(error);
    }
  },
);

export const pendingUserInput = defineField<
  SessionChat,
  NoArgs,
  SessionChatPendingRequest | null
>((parent) => parent.pendingRequest ?? null);

export const sendSessionChatMessage = defineMutation<
  { input: SendSessionChatMessageInput },
  SendSessionChatMessagePayload
>(async (_root, args, context) => {
  try {
    const viewerId = requireViewerId(context);
    const response = await sendSessionClaudeChatMessageService(
      context.db,
      viewerId,
      args.input.sessionId,
      toSendMessageServiceInput(args.input),
    );
    return {
      status: SendSessionChatMessageStatus.Submitted,
    };
  } catch (error) {
    throw toGraphQLError(error);
  }
});

export const submitSessionChatUserInput = defineMutation<
  { input: SubmitSessionChatUserInputInput },
  SubmitSessionChatUserInputPayload
>(async (_root, args, context) => {
  try {
    const viewerId = requireViewerId(context);
    const response = await submitSessionClaudeChatUserInputService(
      context.db,
      viewerId,
      args.input.sessionId,
      {
        toolUseId: args.input.toolUseId,
        behavior: args.input.behavior,
        message: args.input.message,
        answers: toAnswersRecord(args.input.answers),
      },
    );
    return {
      ok: response.ok,
    };
  } catch (error) {
    throw toGraphQLError(error);
  }
});
