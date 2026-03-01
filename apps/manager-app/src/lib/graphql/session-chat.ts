import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AgentMessage,
  AgentMessageData,
  AgentMessageMetadata,
  AgentMessagePart,
  GetSessionChatResponse,
  SessionChatPendingUserInput,
  SessionChatPendingUserInputAnswerValue,
} from "@/lib/session-chat-types";
import type { SessionRecord, SessionStatus } from "@/lib/session-types";
import {
  type SessionChatPageQueryQuery,
  type SessionChatPageQueryQueryVariables,
  type SendSessionChatMessageMutationMutation,
  type SendSessionChatMessageMutationMutationVariables,
  type SubmitSessionChatUserInputMutationMutation,
  type SubmitSessionChatUserInputMutationMutationVariables,
} from "@/lib/graphql/__generated__/graphql";
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
  visibility: SessionChatPageMetadata["visibility"],
): AgentMessageMetadata["visibility"] {
  switch (visibility) {
    case "DEFAULT":
      return "default";
    case "TRACE":
      return "trace";
    case undefined:
    case null:
      return undefined;
  }
}

function toMetadataStatus(
  status: SessionChatPageMetadata["status"],
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
  }
}

function toProvider(
  provider: SessionChatPageMetadata["provider"],
): AgentMessageMetadata["provider"] {
  switch (provider) {
    case "CLAUDE_AGENT_SDK":
      return "claude-agent-sdk";
    case undefined:
    case null:
      return undefined;
  }
}

function toRole(role: SessionChatPageMessage["role"]): AgentMessage["role"] {
  switch (role) {
    case "USER":
      return "user";
    case "ASSISTANT":
      return "assistant";
    case "SYSTEM":
      return "system";
  }
}

function toTextState(
  state: "DONE" | "STREAMING" | null | undefined,
): "done" | "streaming" | undefined {
  switch (state) {
    case "DONE":
      return "done";
    case "STREAMING":
      return "streaming";
    case undefined:
    case null:
      return undefined;
  }
}

function toDynamicToolState(
  state:
    | "APPROVAL_REQUESTED"
    | "APPROVAL_RESPONDED"
    | "INPUT_AVAILABLE"
    | "INPUT_STREAMING"
    | "OUTPUT_AVAILABLE"
    | "OUTPUT_DENIED"
    | "OUTPUT_ERROR",
): Extract<AgentMessagePart, { type: "dynamic-tool" }>["state"] {
  switch (state) {
    case "INPUT_STREAMING":
      return "input-streaming";
    case "INPUT_AVAILABLE":
      return "input-available";
    case "APPROVAL_REQUESTED":
      return "approval-requested";
    case "APPROVAL_RESPONDED":
      return "approval-responded";
    case "OUTPUT_AVAILABLE":
      return "output-available";
    case "OUTPUT_ERROR":
      return "output-error";
    case "OUTPUT_DENIED":
      return "output-denied";
  }
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
      return {
        type: "dynamic-tool",
        toolName: part.toolName,
        toolCallId: part.toolCallId,
        title: part.title ?? undefined,
        providerExecuted: part.providerExecuted ?? undefined,
        state: toDynamicToolState(part.toolState),
        input: part.input ?? undefined,
        output: part.output ?? undefined,
        errorText: part.errorText ?? undefined,
        preliminary: part.preliminary ?? undefined,
        approval: part.approval
          ? {
              id: part.approval.id,
              approved: part.approval.approved ?? undefined,
              reason: part.approval.reason ?? undefined,
            }
          : undefined,
      } as AgentMessagePart;
    case "AgentMessageToolProgressPart":
      return {
        type: "data-tool_progress",
        data: {
          toolUseId: part.data.toolUseId,
          toolName: part.data.toolName,
          elapsedSeconds: part.data.elapsedSeconds,
        },
      };
    case "AgentMessageToolSummaryPart":
      return {
        type: "data-tool_summary",
        data: {
          summary: part.data.summary,
          precedingToolUseIds: part.data.precedingToolUseIds,
        },
      };
    case "AgentMessageRunResultPart":
      return {
        type: "data-run_result",
        data: {
          subtype: part.data.subtype,
          isError: part.data.isError,
          summaryText: part.data.summaryText,
          metrics: part.data.metrics
            ? {
                durationMs: part.data.metrics.durationMs ?? undefined,
                durationApiMs: part.data.metrics.durationApiMs ?? undefined,
                numTurns: part.data.metrics.numTurns ?? undefined,
                totalCostUsd: part.data.metrics.totalCostUsd ?? undefined,
              }
            : undefined,
        },
      };
    case "AgentMessageStatusEventPart":
      return {
        type: "data-status_event",
        data: {
          subtype: part.data.subtype,
          data: part.data.data as AgentMessageData["status_event"]["data"],
        },
      };
    case "AgentMessageFileBatchPart":
      return {
        type: "data-file_batch",
        data: {
          files: part.data.files.map((file) => ({
            filename: file.filename,
            fileId: file.fileId,
          })),
          failed: part.data.failed.map((file) => ({
            filename: file.filename,
            error: file.error,
          })),
          processedAt: part.data.processedAt ?? undefined,
        },
      };
    case "AgentMessageStreamEventPart":
      return {
        type: "data-stream_event",
        data: {
          eventType: part.data.eventType ?? undefined,
          data: part.data.data,
        },
      };
    case "AgentMessageErrorEventPart":
      return {
        type: "data-error_event",
        data: {
          message: part.data.message,
          code: part.data.code ?? undefined,
        },
      };
    case "AgentMessageUnknownEventPart":
      return {
        type: "data-unknown_event",
        data: {
          rawType: part.data.rawType,
          rawSubtype: part.data.rawSubtype ?? undefined,
          data: part.data.data,
        },
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
