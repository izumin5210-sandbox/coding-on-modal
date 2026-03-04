import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { JsonValue } from "@/lib/graphql-scalar-types";
import type {
  SendSessionChatMessageMutationMutation,
  SendSessionChatMessageMutationMutationVariables,
  SessionChatPageQueryQuery,
  SessionChatPageQueryQueryVariables,
  SubmitSessionChatUserInputMutationMutation,
  SubmitSessionChatUserInputMutationMutationVariables,
} from "@/lib/graphql/__generated__/graphql";
import type {
  AgentMessage,
  AgentMessageEventData,
  AgentMessageMetadata,
  AgentMessagePart,
  GetSessionChatResponse,
  SessionChatPendingUserInput,
  SessionChatPendingUserInputAnswerValue,
} from "@/lib/session-chat-types";
import type { SessionRecord, SessionStatus } from "@/lib/session-types";
import { executeGraphQL } from "./client";
import {
  sendSessionChatMessageDocument,
  sessionChatPageDocument,
  submitSessionChatUserInputDocument,
} from "./operations";

type SessionChatPageSession = NonNullable<SessionChatPageQueryQuery["session"]>;
type SessionChatPageMessage =
  SessionChatPageSession["chat"]["messages"][number];
type SessionChatPageMetadata = NonNullable<SessionChatPageMessage["metadata"]>;
type SessionChatPagePart = SessionChatPageMessage["parts"][number];
type SessionChatPageEventData = NonNullable<
  Extract<
    SessionChatPagePart,
    { __typename: "AgentMessageEventPart" }
  >["eventData"]
>;
type SessionChatPagePendingUserInput =
  SessionChatPageSession["chat"]["pendingUserInput"];

function toSessionStatus(
  status: SessionChatPageSession["status"],
): SessionStatus {
  switch (status) {
    case "CREATING":
      return "creating";
    case "RUNNING":
      return "running";
    case "TERMINATED":
      return "terminated";
    case "ERROR":
      return "error";
  }
}

function toVisibility(
  visibility: SessionChatPageMetadata["visibility"] | string,
): AgentMessageMetadata["visibility"] {
  switch (visibility) {
    case "DEFAULT":
      return "default";
    case "TRACE":
      return "trace";
    case undefined:
    case null:
      return undefined;
    default:
      return undefined;
  }
}

function toMetadataStatus(
  status: SessionChatPageMetadata["status"] | string,
): AgentMessageMetadata["status"] {
  switch (status) {
    case "IN_PROGRESS":
      return "in-progress";
    case "DONE":
      return "done";
    case "ERROR":
      return "error";
    case undefined:
    case null:
      return undefined;
    default:
      return undefined;
  }
}

function toProvider(
  provider: SessionChatPageMetadata["provider"] | string,
): AgentMessageMetadata["provider"] {
  switch (provider) {
    case "CLAUDE_AGENT_SDK":
      return "claude-agent-sdk";
    case undefined:
    case null:
      return undefined;
    default:
      return undefined;
  }
}

function toRole(
  role: SessionChatPageMessage["role"] | string,
): AgentMessage["role"] {
  switch (role) {
    case "USER":
    case "user":
      return "user";
    case "ASSISTANT":
    case "assistant":
      return "assistant";
    case "SYSTEM":
    case "system":
      return "system";
    default:
      return "assistant";
  }
}

function toTextState(
  state: string | null | undefined,
): "done" | "streaming" | undefined {
  switch (state) {
    case "DONE":
      return "done";
    case "STREAMING":
      return "streaming";
    case undefined:
    case null:
      return undefined;
    default:
      return undefined;
  }
}

function toJsonValue(value: unknown): JsonValue {
  return value as JsonValue;
}

function toMetadata(
  metadata: SessionChatPageMessage["metadata"],
): AgentMessageMetadata | undefined {
  if (!metadata) {
    return undefined;
  }

  return {
    createdAt: metadata.createdAt ?? undefined,
    updatedAt: metadata.updatedAt ?? undefined,
    visibility: toVisibility(metadata.visibility),
    status: toMetadataStatus(metadata.status),
    label: metadata.label ?? undefined,
    isReplay: metadata.isReplay ?? undefined,
    isSynthetic: metadata.isSynthetic ?? undefined,
    parentToolUseId: metadata.parentToolUseId ?? undefined,
    provider: toProvider(metadata.provider),
    providerSessionId: metadata.providerSessionId ?? undefined,
    providerMessageType: metadata.providerMessageType ?? undefined,
    providerSubtype: metadata.providerSubtype ?? undefined,
    providerUuid: metadata.providerUuid ?? undefined,
    rawStoredMessageId: metadata.rawStoredMessageId ?? undefined,
  };
}

function toPart(part: SessionChatPagePart): AgentMessagePart {
  switch (part.__typename) {
    case "AgentMessageTextPart":
      return {
        type: "text",
        text: part.text,
        state: toTextState(part.textState),
      };
    case "AgentMessageReasoningPart":
      return {
        type: "reasoning",
        text: part.text,
        state: toTextState(part.reasoningState),
      };
    case "AgentMessageDynamicToolPart":
      return toDynamicToolPart(part);
    case "AgentMessageEventPart":
      return {
        type: "data-event",
        data: toEventData(part.eventData),
      };
    case "AgentMessageResultPart":
      return {
        type: "data-result",
        data: {
          subtype: part.resultData.subtype,
          isError: part.resultData.isError,
          summaryText: part.resultData.summaryText,
          metrics: part.resultData.metrics
            ? {
                durationMs: part.resultData.metrics.durationMs ?? undefined,
                durationApiMs:
                  part.resultData.metrics.durationApiMs ?? undefined,
                numTurns: part.resultData.metrics.numTurns ?? undefined,
                totalCostUsd: part.resultData.metrics.totalCostUsd ?? undefined,
              }
            : undefined,
        },
      };
  }
}

function toFallbackUnknownEvent(): AgentMessageEventData {
  return {
    kind: "unknown",
    rawType: "missing_event_data",
    data: {},
  };
}

function toDynamicToolPart(
  part: Extract<
    SessionChatPagePart,
    { __typename: "AgentMessageDynamicToolPart" }
  >,
): Extract<AgentMessagePart, { type: "dynamic-tool" }> {
  const base = {
    type: "dynamic-tool" as const,
    toolName: part.toolName,
    toolCallId: part.toolCallId,
    title: part.title ?? undefined,
    providerExecuted: part.providerExecuted ?? undefined,
  };

  switch (part.toolState) {
    case "INPUT_STREAMING":
      return {
        ...base,
        state: "input-streaming",
        input: part.input ?? undefined,
      };
    case "INPUT_AVAILABLE":
      return {
        ...base,
        state: "input-available",
        input: part.input,
      };
    case "APPROVAL_REQUESTED":
      return {
        ...base,
        state: "approval-requested",
        input: part.input,
        approval: {
          id: part.approval?.id ?? part.toolCallId,
        },
      };
    case "APPROVAL_RESPONDED":
      return {
        ...base,
        state: "approval-responded",
        input: part.input,
        approval: {
          id: part.approval?.id ?? part.toolCallId,
          approved: part.approval?.approved ?? false,
          reason: part.approval?.reason ?? undefined,
        },
      };
    case "OUTPUT_AVAILABLE":
      return {
        ...base,
        state: "output-available",
        input: part.input,
        output: part.output,
        preliminary: part.preliminary ?? undefined,
        approval:
          part.approval?.approved === true
            ? {
                id: part.approval.id,
                approved: true,
                reason: part.approval.reason ?? undefined,
              }
            : undefined,
      };
    case "OUTPUT_ERROR":
      return {
        ...base,
        state: "output-error",
        input: part.input ?? undefined,
        errorText: part.errorText ?? "Tool execution failed.",
        approval:
          part.approval?.approved === true
            ? {
                id: part.approval.id,
                approved: true,
                reason: part.approval.reason ?? undefined,
              }
            : undefined,
      };
    case "OUTPUT_DENIED":
      return {
        ...base,
        state: "output-denied",
        input: part.input,
        approval: {
          id: part.approval?.id ?? part.toolCallId,
          approved: false,
          reason: part.approval?.reason ?? undefined,
        },
      };
    default:
      return {
        ...base,
        state: "input-available",
        input: part.input ?? undefined,
      };
  }
}

function toEventData(
  data: SessionChatPageEventData | null | undefined,
): AgentMessageEventData {
  if (!data) {
    return toFallbackUnknownEvent();
  }

  switch (data.__typename) {
    case "AgentMessageToolProgressEvent":
      return {
        kind: "tool-progress",
        toolUseId: data.toolUseId,
        toolName: data.toolName,
        elapsedSeconds: data.elapsedSeconds,
      };
    case "AgentMessageToolSummaryEvent":
      return {
        kind: "tool-summary",
        summary: data.summary,
        precedingToolUseIds: data.precedingToolUseIds,
      };
    case "AgentMessageStatusEvent":
      return {
        kind: "status",
        subtype: data.subtype,
        data: data.data as Record<string, unknown>,
      };
    case "AgentMessageFileBatchEvent":
      return {
        kind: "file-batch",
        files: data.files.map((file) => ({
          filename: file.filename,
          fileId: file.fileId,
        })),
        failed: data.failed.map((file) => ({
          filename: file.filename,
          error: file.error,
        })),
        processedAt: data.processedAt ?? undefined,
      };
    case "AgentMessageStreamEvent":
      return {
        kind: "stream",
        eventType: data.eventType ?? undefined,
        data: toJsonValue(data.data),
      };
    case "AgentMessageErrorEvent":
      return {
        kind: "error",
        message: data.message,
        code: data.code ?? undefined,
      };
    case "AgentMessageUnknownEvent":
      return {
        kind: "unknown",
        rawType: data.rawType,
        rawSubtype: data.rawSubtype ?? undefined,
        data: toJsonValue(data.data),
      };
  }
}

function toPendingUserInput(
  pending: SessionChatPagePendingUserInput,
): SessionChatPendingUserInput | null {
  if (!pending) {
    return null;
  }

  if (pending.__typename === "SessionChatAskUserQuestionPendingRequest") {
    return {
      requestId: pending.requestId,
      toolName: pending.toolName,
      toolUseId: pending.toolUseId,
      kind: "ask-user-question",
      createdAt: pending.createdAt,
      input: (pending.input ?? {}) as Record<string, unknown>,
      questions: pending.questions.map((question) => ({
        header: question.header,
        question: question.question,
        multiSelect: question.multiSelect,
        options: question.options.map((option) => ({
          label: option.label,
          description: option.description,
        })),
      })),
      decisionReason: pending.decisionReason ?? undefined,
      blockedPath: pending.blockedPath ?? undefined,
      agentId: pending.agentId ?? undefined,
      suggestions: pending.suggestions ?? undefined,
    };
  }

  return {
    requestId: pending.requestId,
    toolName: pending.toolName,
    toolUseId: pending.toolUseId,
    kind: "tool-approval",
    createdAt: pending.createdAt,
    input: (pending.input ?? {}) as Record<string, unknown>,
    decisionReason: pending.decisionReason ?? undefined,
    blockedPath: pending.blockedPath ?? undefined,
    agentId: pending.agentId ?? undefined,
    suggestions: pending.suggestions ?? undefined,
  };
}

function toSessionRecord(session: SessionChatPageSession): SessionRecord {
  return {
    id: session.id,
    name: session.name,
    repoUrl: session.repoUrl,
    repoRef: session.repoRef,
    status: toSessionStatus(session.status),
    workspacePath: session.workspacePath,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    lastError: session.lastError ?? undefined,
  };
}

function toSessionChatResponse(
  data: SessionChatPageQueryQuery,
): GetSessionChatResponse {
  const session = data.session;
  if (!session) {
    throw new Error("Session not found.");
  }

  return {
    session: toSessionRecord(session),
    thread: {
      id: session.chat.thread.id,
      sessionId: session.chat.thread.sessionId,
      claudeSdkSessionId: session.chat.thread.claudeSdkSessionId ?? undefined,
      cwd: session.chat.thread.cwd,
      maxTurns: session.chat.thread.maxTurns,
      isRunning: session.chat.thread.isRunning,
      lastError: session.chat.thread.lastError ?? undefined,
      createdAt: session.chat.thread.createdAt,
      updatedAt: session.chat.thread.updatedAt,
    },
    messages: session.chat.messages.map((message) => ({
      id: message.id,
      role: toRole(message.role),
      metadata: toMetadata(message.metadata),
      parts: message.parts.map((part) => toPart(part)),
    })),
    rawCount: session.chat.rawCount,
    pendingUserInput: toPendingUserInput(session.chat.pendingUserInput),
  };
}

function toAnswerValues(
  value: SessionChatPendingUserInputAnswerValue,
): string[] {
  return Array.isArray(value) ? value : [value];
}

function toSubmitBehavior(
  behavior: "allow" | "deny",
): SubmitSessionChatUserInputMutationMutationVariables["input"]["behavior"] {
  switch (behavior) {
    case "allow":
      return "ALLOW";
    case "deny":
      return "DENY";
  }
}

export function getSessionChatQueryKey(sessionId: string) {
  return ["session-chat", sessionId] as const;
}

async function fetchSessionChat(
  sessionId: string,
): Promise<GetSessionChatResponse> {
  const data = await executeGraphQL<
    SessionChatPageQueryQuery,
    SessionChatPageQueryQueryVariables
  >(sessionChatPageDocument, { id: sessionId });
  return toSessionChatResponse(data);
}

export function useSessionChatQuery(sessionId: string) {
  return useQuery({
    queryKey: getSessionChatQueryKey(sessionId),
    queryFn: () => fetchSessionChat(sessionId),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) {
        return false;
      }

      return data.thread.isRunning || data.pendingUserInput ? 1500 : false;
    },
  });
}

export function useSendSessionChatMessageMutation(sessionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      prompt: string;
      cwd?: string;
      maxTurns?: number;
    }) =>
      executeGraphQL<
        SendSessionChatMessageMutationMutation,
        SendSessionChatMessageMutationMutationVariables
      >(sendSessionChatMessageDocument, {
        input: {
          sessionId,
          prompt: input.prompt,
          cwd: input.cwd,
          maxTurns: input.maxTurns,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: getSessionChatQueryKey(sessionId),
      });
    },
  });
}

export function useSubmitSessionChatUserInputMutation(sessionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      toolUseId: string;
      behavior: "allow" | "deny";
      answers?: Record<string, SessionChatPendingUserInputAnswerValue>;
      message?: string;
    }) =>
      executeGraphQL<
        SubmitSessionChatUserInputMutationMutation,
        SubmitSessionChatUserInputMutationMutationVariables
      >(submitSessionChatUserInputDocument, {
        input: {
          sessionId,
          toolUseId: input.toolUseId,
          behavior: toSubmitBehavior(input.behavior),
          message: input.message,
          answers: input.answers
            ? Object.entries(input.answers).map(([key, value]) => ({
                key,
                values: toAnswerValues(value),
              }))
            : undefined,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: getSessionChatQueryKey(sessionId),
      });
    },
  });
}
