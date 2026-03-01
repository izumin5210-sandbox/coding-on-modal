/* eslint-disable */
import type { TypedDocumentNode as DocumentNode } from "@graphql-typed-document-node/core";
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type Incremental<T> =
  | T
  | {
      [P in keyof T]?: P extends " $fragmentName" | "__typename" ? T[P] : never;
    };
/** Defined in: src/server/graphql/schema/agent-message.ts */
export type AgentMessageDynamicToolPartState =
  | "APPROVAL_REQUESTED"
  | "APPROVAL_RESPONDED"
  | "INPUT_AVAILABLE"
  | "INPUT_STREAMING"
  | "OUTPUT_AVAILABLE"
  | "OUTPUT_DENIED"
  | "OUTPUT_ERROR";

/** Defined in: src/server/graphql/schema/agent-message.ts */
export type AgentMessageMetadataStatus = "DONE" | "ERROR" | "IN_PROGRESS";

/** Defined in: src/server/graphql/schema/agent-message.ts */
export type AgentMessageMetadataVisibility = "DEFAULT" | "TRACE";

/** Defined in: src/server/graphql/schema/agent-message.ts */
export type AgentMessageProvider = "CLAUDE_AGENT_SDK";

/** Defined in: src/server/graphql/schema/agent-message.ts */
export type AgentMessageReasoningPartState = "DONE" | "STREAMING";

/** Defined in: src/server/graphql/schema/agent-message.ts */
export type AgentMessageRole = "ASSISTANT" | "SYSTEM" | "USER";

/** Defined in: src/server/graphql/schema/agent-message.ts */
export type AgentMessageTextPartState = "DONE" | "STREAMING";

/** Defined in: src/server/graphql/schema/session-chat.ts */
export type SendSessionChatMessageInput = {
  cwd?: string | null | undefined;
  maxTurns?: number | null | undefined;
  prompt: string;
  sessionId: string | number;
};

/** Defined in: src/server/graphql/schema/session-chat.ts */
export type SendSessionChatMessageStatus = "SUBMITTED";

/** Defined in: src/server/graphql/schema/session-chat.ts */
export type SessionChatPendingRequestKind =
  | "ASK_USER_QUESTION"
  | "TOOL_APPROVAL";

/** Defined in: src/server/graphql/schema/session.ts */
export type SessionStatus = "CREATING" | "ERROR" | "RUNNING" | "TERMINATED";

/** Defined in: src/server/graphql/schema/session-chat.ts */
export type SubmitSessionChatUserInputAnswerInput = {
  key: string;
  values: Array<string>;
};

/** Defined in: src/server/graphql/schema/session-chat.ts */
export type SubmitSessionChatUserInputBehaviorInput = "ALLOW" | "DENY";

/** Defined in: src/server/graphql/schema/session-chat.ts */
export type SubmitSessionChatUserInputInput = {
  answers?: Array<SubmitSessionChatUserInputAnswerInput> | null | undefined;
  behavior: SubmitSessionChatUserInputBehaviorInput;
  message?: string | null | undefined;
  sessionId: string | number;
  toolUseId: string;
};

export type SessionChatPageQueryQueryVariables = Exact<{
  id: string | number;
}>;

export type SessionChatPageQueryQuery = {
  session: {
    id: string;
    name: string;
    repoUrl: string;
    repoRef: string;
    status: SessionStatus;
    workspacePath: string;
    createdAt: string;
    updatedAt: string;
    lastError: string | null;
    chat: {
      rawCount: number;
      thread: {
        id: string;
        sessionId: string;
        claudeSdkSessionId: string | null;
        cwd: string;
        maxTurns: number;
        isRunning: boolean;
        lastError: string | null;
        createdAt: string;
        updatedAt: string;
      };
      pendingUserInput:
        | {
            __typename: "SessionChatAskUserQuestionPendingRequest";
            requestId: string;
            toolName: string;
            toolUseId: string;
            kind: SessionChatPendingRequestKind;
            createdAt: string;
            input: unknown;
            decisionReason: string | null;
            blockedPath: string | null;
            agentId: string | null;
            suggestions: Array<unknown> | null;
            questions: Array<{
              header: string;
              question: string;
              multiSelect: boolean;
              options: Array<{ label: string; description: string }>;
            }>;
          }
        | {
            __typename: "SessionChatToolApprovalPendingRequest";
            requestId: string;
            toolName: string;
            toolUseId: string;
            kind: SessionChatPendingRequestKind;
            createdAt: string;
            input: unknown;
            decisionReason: string | null;
            blockedPath: string | null;
            agentId: string | null;
            suggestions: Array<unknown> | null;
          }
        | null;
      messages: Array<{
        id: string;
        role: AgentMessageRole;
        metadata: {
          createdAt: string | null;
          updatedAt: string | null;
          visibility: AgentMessageMetadataVisibility | null;
          status: AgentMessageMetadataStatus | null;
          label: string | null;
          isReplay: boolean | null;
          isSynthetic: boolean | null;
          parentToolUseId: string | null;
          provider: AgentMessageProvider | null;
          providerSessionId: string | null;
          providerMessageType: string | null;
          providerSubtype: string | null;
          providerUuid: string | null;
          rawStoredMessageId: string | null;
        } | null;
        parts: Array<
          | {
              __typename: "AgentMessageDynamicToolPart";
              type: string;
              toolName: string;
              toolCallId: string;
              title: string | null;
              providerExecuted: boolean | null;
              input: unknown;
              output: unknown;
              errorText: string | null;
              preliminary: boolean | null;
              toolState: AgentMessageDynamicToolPartState;
              approval: {
                id: string;
                approved: boolean | null;
                reason: string | null;
              } | null;
            }
          | {
              __typename: "AgentMessageErrorEventPart";
              type: string;
              data: { message: string; code: string | null };
            }
          | {
              __typename: "AgentMessageFileBatchPart";
              type: string;
              data: {
                processedAt: string | null;
                files: Array<{ filename: string; fileId: string }>;
                failed: Array<{ filename: string; error: string }>;
              };
            }
          | {
              __typename: "AgentMessageReasoningPart";
              type: string;
              text: string;
              reasoningState: AgentMessageReasoningPartState | null;
            }
          | {
              __typename: "AgentMessageRunResultPart";
              type: string;
              data: {
                subtype: string;
                isError: boolean;
                summaryText: string;
                metrics: {
                  durationMs: number | null;
                  durationApiMs: number | null;
                  numTurns: number | null;
                  totalCostUsd: number | null;
                } | null;
              };
            }
          | {
              __typename: "AgentMessageStatusEventPart";
              type: string;
              data: { subtype: string; data: unknown };
            }
          | {
              __typename: "AgentMessageStreamEventPart";
              type: string;
              data: { eventType: string | null; data: unknown };
            }
          | {
              __typename: "AgentMessageTextPart";
              type: string;
              text: string;
              textState: AgentMessageTextPartState | null;
            }
          | {
              __typename: "AgentMessageToolProgressPart";
              type: string;
              data: {
                toolUseId: string;
                toolName: string;
                elapsedSeconds: number;
              };
            }
          | {
              __typename: "AgentMessageToolSummaryPart";
              type: string;
              data: { summary: string; precedingToolUseIds: Array<string> };
            }
          | {
              __typename: "AgentMessageUnknownEventPart";
              type: string;
              data: {
                rawType: string;
                rawSubtype: string | null;
                data: unknown;
              };
            }
        >;
      }>;
    };
  } | null;
};

export type SendSessionChatMessageMutationMutationVariables = Exact<{
  input: SendSessionChatMessageInput;
}>;

export type SendSessionChatMessageMutationMutation = {
  sendSessionChatMessage: { status: SendSessionChatMessageStatus };
};

export type SubmitSessionChatUserInputMutationMutationVariables = Exact<{
  input: SubmitSessionChatUserInputInput;
}>;

export type SubmitSessionChatUserInputMutationMutation = {
  submitSessionChatUserInput: { ok: boolean };
};

export const SessionChatPageQueryDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "SessionChatPageQuery" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "id" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "session" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "id" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "id" },
                },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "repoUrl" } },
                { kind: "Field", name: { kind: "Name", value: "repoRef" } },
                { kind: "Field", name: { kind: "Name", value: "status" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "workspacePath" },
                },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
                { kind: "Field", name: { kind: "Name", value: "lastError" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "chat" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "rawCount" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "thread" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            {
                              kind: "Field",
                              name: { kind: "Name", value: "id" },
                            },
                            {
                              kind: "Field",
                              name: { kind: "Name", value: "sessionId" },
                            },
                            {
                              kind: "Field",
                              name: {
                                kind: "Name",
                                value: "claudeSdkSessionId",
                              },
                            },
                            {
                              kind: "Field",
                              name: { kind: "Name", value: "cwd" },
                            },
                            {
                              kind: "Field",
                              name: { kind: "Name", value: "maxTurns" },
                            },
                            {
                              kind: "Field",
                              name: { kind: "Name", value: "isRunning" },
                            },
                            {
                              kind: "Field",
                              name: { kind: "Name", value: "lastError" },
                            },
                            {
                              kind: "Field",
                              name: { kind: "Name", value: "createdAt" },
                            },
                            {
                              kind: "Field",
                              name: { kind: "Name", value: "updatedAt" },
                            },
                          ],
                        },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "pendingUserInput" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            {
                              kind: "Field",
                              name: { kind: "Name", value: "__typename" },
                            },
                            {
                              kind: "InlineFragment",
                              typeCondition: {
                                kind: "NamedType",
                                name: {
                                  kind: "Name",
                                  value:
                                    "SessionChatAskUserQuestionPendingRequest",
                                },
                              },
                              selectionSet: {
                                kind: "SelectionSet",
                                selections: [
                                  {
                                    kind: "Field",
                                    name: { kind: "Name", value: "requestId" },
                                  },
                                  {
                                    kind: "Field",
                                    name: { kind: "Name", value: "toolName" },
                                  },
                                  {
                                    kind: "Field",
                                    name: { kind: "Name", value: "toolUseId" },
                                  },
                                  {
                                    kind: "Field",
                                    name: { kind: "Name", value: "kind" },
                                  },
                                  {
                                    kind: "Field",
                                    name: { kind: "Name", value: "createdAt" },
                                  },
                                  {
                                    kind: "Field",
                                    name: { kind: "Name", value: "input" },
                                  },
                                  {
                                    kind: "Field",
                                    name: {
                                      kind: "Name",
                                      value: "decisionReason",
                                    },
                                  },
                                  {
                                    kind: "Field",
                                    name: {
                                      kind: "Name",
                                      value: "blockedPath",
                                    },
                                  },
                                  {
                                    kind: "Field",
                                    name: { kind: "Name", value: "agentId" },
                                  },
                                  {
                                    kind: "Field",
                                    name: {
                                      kind: "Name",
                                      value: "suggestions",
                                    },
                                  },
                                  {
                                    kind: "Field",
                                    name: { kind: "Name", value: "questions" },
                                    selectionSet: {
                                      kind: "SelectionSet",
                                      selections: [
                                        {
                                          kind: "Field",
                                          name: {
                                            kind: "Name",
                                            value: "header",
                                          },
                                        },
                                        {
                                          kind: "Field",
                                          name: {
                                            kind: "Name",
                                            value: "question",
                                          },
                                        },
                                        {
                                          kind: "Field",
                                          name: {
                                            kind: "Name",
                                            value: "multiSelect",
                                          },
                                        },
                                        {
                                          kind: "Field",
                                          name: {
                                            kind: "Name",
                                            value: "options",
                                          },
                                          selectionSet: {
                                            kind: "SelectionSet",
                                            selections: [
                                              {
                                                kind: "Field",
                                                name: {
                                                  kind: "Name",
                                                  value: "label",
                                                },
                                              },
                                              {
                                                kind: "Field",
                                                name: {
                                                  kind: "Name",
                                                  value: "description",
                                                },
                                              },
                                            ],
                                          },
                                        },
                                      ],
                                    },
                                  },
                                ],
                              },
                            },
                            {
                              kind: "InlineFragment",
                              typeCondition: {
                                kind: "NamedType",
                                name: {
                                  kind: "Name",
                                  value:
                                    "SessionChatToolApprovalPendingRequest",
                                },
                              },
                              selectionSet: {
                                kind: "SelectionSet",
                                selections: [
                                  {
                                    kind: "Field",
                                    name: { kind: "Name", value: "requestId" },
                                  },
                                  {
                                    kind: "Field",
                                    name: { kind: "Name", value: "toolName" },
                                  },
                                  {
                                    kind: "Field",
                                    name: { kind: "Name", value: "toolUseId" },
                                  },
                                  {
                                    kind: "Field",
                                    name: { kind: "Name", value: "kind" },
                                  },
                                  {
                                    kind: "Field",
                                    name: { kind: "Name", value: "createdAt" },
                                  },
                                  {
                                    kind: "Field",
                                    name: { kind: "Name", value: "input" },
                                  },
                                  {
                                    kind: "Field",
                                    name: {
                                      kind: "Name",
                                      value: "decisionReason",
                                    },
                                  },
                                  {
                                    kind: "Field",
                                    name: {
                                      kind: "Name",
                                      value: "blockedPath",
                                    },
                                  },
                                  {
                                    kind: "Field",
                                    name: { kind: "Name", value: "agentId" },
                                  },
                                  {
                                    kind: "Field",
                                    name: {
                                      kind: "Name",
                                      value: "suggestions",
                                    },
                                  },
                                ],
                              },
                            },
                          ],
                        },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "messages" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            {
                              kind: "Field",
                              name: { kind: "Name", value: "id" },
                            },
                            {
                              kind: "Field",
                              name: { kind: "Name", value: "role" },
                            },
                            {
                              kind: "Field",
                              name: { kind: "Name", value: "metadata" },
                              selectionSet: {
                                kind: "SelectionSet",
                                selections: [
                                  {
                                    kind: "Field",
                                    name: { kind: "Name", value: "createdAt" },
                                  },
                                  {
                                    kind: "Field",
                                    name: { kind: "Name", value: "updatedAt" },
                                  },
                                  {
                                    kind: "Field",
                                    name: { kind: "Name", value: "visibility" },
                                  },
                                  {
                                    kind: "Field",
                                    name: { kind: "Name", value: "status" },
                                  },
                                  {
                                    kind: "Field",
                                    name: { kind: "Name", value: "label" },
                                  },
                                  {
                                    kind: "Field",
                                    name: { kind: "Name", value: "isReplay" },
                                  },
                                  {
                                    kind: "Field",
                                    name: {
                                      kind: "Name",
                                      value: "isSynthetic",
                                    },
                                  },
                                  {
                                    kind: "Field",
                                    name: {
                                      kind: "Name",
                                      value: "parentToolUseId",
                                    },
                                  },
                                  {
                                    kind: "Field",
                                    name: { kind: "Name", value: "provider" },
                                  },
                                  {
                                    kind: "Field",
                                    name: {
                                      kind: "Name",
                                      value: "providerSessionId",
                                    },
                                  },
                                  {
                                    kind: "Field",
                                    name: {
                                      kind: "Name",
                                      value: "providerMessageType",
                                    },
                                  },
                                  {
                                    kind: "Field",
                                    name: {
                                      kind: "Name",
                                      value: "providerSubtype",
                                    },
                                  },
                                  {
                                    kind: "Field",
                                    name: {
                                      kind: "Name",
                                      value: "providerUuid",
                                    },
                                  },
                                  {
                                    kind: "Field",
                                    name: {
                                      kind: "Name",
                                      value: "rawStoredMessageId",
                                    },
                                  },
                                ],
                              },
                            },
                            {
                              kind: "Field",
                              name: { kind: "Name", value: "parts" },
                              selectionSet: {
                                kind: "SelectionSet",
                                selections: [
                                  {
                                    kind: "Field",
                                    name: { kind: "Name", value: "__typename" },
                                  },
                                  {
                                    kind: "InlineFragment",
                                    typeCondition: {
                                      kind: "NamedType",
                                      name: {
                                        kind: "Name",
                                        value: "AgentMessageTextPart",
                                      },
                                    },
                                    selectionSet: {
                                      kind: "SelectionSet",
                                      selections: [
                                        {
                                          kind: "Field",
                                          name: { kind: "Name", value: "type" },
                                        },
                                        {
                                          kind: "Field",
                                          name: { kind: "Name", value: "text" },
                                        },
                                        {
                                          kind: "Field",
                                          alias: {
                                            kind: "Name",
                                            value: "textState",
                                          },
                                          name: {
                                            kind: "Name",
                                            value: "state",
                                          },
                                        },
                                      ],
                                    },
                                  },
                                  {
                                    kind: "InlineFragment",
                                    typeCondition: {
                                      kind: "NamedType",
                                      name: {
                                        kind: "Name",
                                        value: "AgentMessageReasoningPart",
                                      },
                                    },
                                    selectionSet: {
                                      kind: "SelectionSet",
                                      selections: [
                                        {
                                          kind: "Field",
                                          name: { kind: "Name", value: "type" },
                                        },
                                        {
                                          kind: "Field",
                                          name: { kind: "Name", value: "text" },
                                        },
                                        {
                                          kind: "Field",
                                          alias: {
                                            kind: "Name",
                                            value: "reasoningState",
                                          },
                                          name: {
                                            kind: "Name",
                                            value: "state",
                                          },
                                        },
                                      ],
                                    },
                                  },
                                  {
                                    kind: "InlineFragment",
                                    typeCondition: {
                                      kind: "NamedType",
                                      name: {
                                        kind: "Name",
                                        value: "AgentMessageDynamicToolPart",
                                      },
                                    },
                                    selectionSet: {
                                      kind: "SelectionSet",
                                      selections: [
                                        {
                                          kind: "Field",
                                          name: { kind: "Name", value: "type" },
                                        },
                                        {
                                          kind: "Field",
                                          name: {
                                            kind: "Name",
                                            value: "toolName",
                                          },
                                        },
                                        {
                                          kind: "Field",
                                          name: {
                                            kind: "Name",
                                            value: "toolCallId",
                                          },
                                        },
                                        {
                                          kind: "Field",
                                          name: {
                                            kind: "Name",
                                            value: "title",
                                          },
                                        },
                                        {
                                          kind: "Field",
                                          name: {
                                            kind: "Name",
                                            value: "providerExecuted",
                                          },
                                        },
                                        {
                                          kind: "Field",
                                          alias: {
                                            kind: "Name",
                                            value: "toolState",
                                          },
                                          name: {
                                            kind: "Name",
                                            value: "state",
                                          },
                                        },
                                        {
                                          kind: "Field",
                                          name: {
                                            kind: "Name",
                                            value: "input",
                                          },
                                        },
                                        {
                                          kind: "Field",
                                          name: {
                                            kind: "Name",
                                            value: "output",
                                          },
                                        },
                                        {
                                          kind: "Field",
                                          name: {
                                            kind: "Name",
                                            value: "errorText",
                                          },
                                        },
                                        {
                                          kind: "Field",
                                          name: {
                                            kind: "Name",
                                            value: "preliminary",
                                          },
                                        },
                                        {
                                          kind: "Field",
                                          name: {
                                            kind: "Name",
                                            value: "approval",
                                          },
                                          selectionSet: {
                                            kind: "SelectionSet",
                                            selections: [
                                              {
                                                kind: "Field",
                                                name: {
                                                  kind: "Name",
                                                  value: "id",
                                                },
                                              },
                                              {
                                                kind: "Field",
                                                name: {
                                                  kind: "Name",
                                                  value: "approved",
                                                },
                                              },
                                              {
                                                kind: "Field",
                                                name: {
                                                  kind: "Name",
                                                  value: "reason",
                                                },
                                              },
                                            ],
                                          },
                                        },
                                      ],
                                    },
                                  },
                                  {
                                    kind: "InlineFragment",
                                    typeCondition: {
                                      kind: "NamedType",
                                      name: {
                                        kind: "Name",
                                        value: "AgentMessageToolProgressPart",
                                      },
                                    },
                                    selectionSet: {
                                      kind: "SelectionSet",
                                      selections: [
                                        {
                                          kind: "Field",
                                          name: { kind: "Name", value: "type" },
                                        },
                                        {
                                          kind: "Field",
                                          name: { kind: "Name", value: "data" },
                                          selectionSet: {
                                            kind: "SelectionSet",
                                            selections: [
                                              {
                                                kind: "Field",
                                                name: {
                                                  kind: "Name",
                                                  value: "toolUseId",
                                                },
                                              },
                                              {
                                                kind: "Field",
                                                name: {
                                                  kind: "Name",
                                                  value: "toolName",
                                                },
                                              },
                                              {
                                                kind: "Field",
                                                name: {
                                                  kind: "Name",
                                                  value: "elapsedSeconds",
                                                },
                                              },
                                            ],
                                          },
                                        },
                                      ],
                                    },
                                  },
                                  {
                                    kind: "InlineFragment",
                                    typeCondition: {
                                      kind: "NamedType",
                                      name: {
                                        kind: "Name",
                                        value: "AgentMessageToolSummaryPart",
                                      },
                                    },
                                    selectionSet: {
                                      kind: "SelectionSet",
                                      selections: [
                                        {
                                          kind: "Field",
                                          name: { kind: "Name", value: "type" },
                                        },
                                        {
                                          kind: "Field",
                                          name: { kind: "Name", value: "data" },
                                          selectionSet: {
                                            kind: "SelectionSet",
                                            selections: [
                                              {
                                                kind: "Field",
                                                name: {
                                                  kind: "Name",
                                                  value: "summary",
                                                },
                                              },
                                              {
                                                kind: "Field",
                                                name: {
                                                  kind: "Name",
                                                  value: "precedingToolUseIds",
                                                },
                                              },
                                            ],
                                          },
                                        },
                                      ],
                                    },
                                  },
                                  {
                                    kind: "InlineFragment",
                                    typeCondition: {
                                      kind: "NamedType",
                                      name: {
                                        kind: "Name",
                                        value: "AgentMessageRunResultPart",
                                      },
                                    },
                                    selectionSet: {
                                      kind: "SelectionSet",
                                      selections: [
                                        {
                                          kind: "Field",
                                          name: { kind: "Name", value: "type" },
                                        },
                                        {
                                          kind: "Field",
                                          name: { kind: "Name", value: "data" },
                                          selectionSet: {
                                            kind: "SelectionSet",
                                            selections: [
                                              {
                                                kind: "Field",
                                                name: {
                                                  kind: "Name",
                                                  value: "subtype",
                                                },
                                              },
                                              {
                                                kind: "Field",
                                                name: {
                                                  kind: "Name",
                                                  value: "isError",
                                                },
                                              },
                                              {
                                                kind: "Field",
                                                name: {
                                                  kind: "Name",
                                                  value: "summaryText",
                                                },
                                              },
                                              {
                                                kind: "Field",
                                                name: {
                                                  kind: "Name",
                                                  value: "metrics",
                                                },
                                                selectionSet: {
                                                  kind: "SelectionSet",
                                                  selections: [
                                                    {
                                                      kind: "Field",
                                                      name: {
                                                        kind: "Name",
                                                        value: "durationMs",
                                                      },
                                                    },
                                                    {
                                                      kind: "Field",
                                                      name: {
                                                        kind: "Name",
                                                        value: "durationApiMs",
                                                      },
                                                    },
                                                    {
                                                      kind: "Field",
                                                      name: {
                                                        kind: "Name",
                                                        value: "numTurns",
                                                      },
                                                    },
                                                    {
                                                      kind: "Field",
                                                      name: {
                                                        kind: "Name",
                                                        value: "totalCostUsd",
                                                      },
                                                    },
                                                  ],
                                                },
                                              },
                                            ],
                                          },
                                        },
                                      ],
                                    },
                                  },
                                  {
                                    kind: "InlineFragment",
                                    typeCondition: {
                                      kind: "NamedType",
                                      name: {
                                        kind: "Name",
                                        value: "AgentMessageStatusEventPart",
                                      },
                                    },
                                    selectionSet: {
                                      kind: "SelectionSet",
                                      selections: [
                                        {
                                          kind: "Field",
                                          name: { kind: "Name", value: "type" },
                                        },
                                        {
                                          kind: "Field",
                                          name: { kind: "Name", value: "data" },
                                          selectionSet: {
                                            kind: "SelectionSet",
                                            selections: [
                                              {
                                                kind: "Field",
                                                name: {
                                                  kind: "Name",
                                                  value: "subtype",
                                                },
                                              },
                                              {
                                                kind: "Field",
                                                name: {
                                                  kind: "Name",
                                                  value: "data",
                                                },
                                              },
                                            ],
                                          },
                                        },
                                      ],
                                    },
                                  },
                                  {
                                    kind: "InlineFragment",
                                    typeCondition: {
                                      kind: "NamedType",
                                      name: {
                                        kind: "Name",
                                        value: "AgentMessageFileBatchPart",
                                      },
                                    },
                                    selectionSet: {
                                      kind: "SelectionSet",
                                      selections: [
                                        {
                                          kind: "Field",
                                          name: { kind: "Name", value: "type" },
                                        },
                                        {
                                          kind: "Field",
                                          name: { kind: "Name", value: "data" },
                                          selectionSet: {
                                            kind: "SelectionSet",
                                            selections: [
                                              {
                                                kind: "Field",
                                                name: {
                                                  kind: "Name",
                                                  value: "processedAt",
                                                },
                                              },
                                              {
                                                kind: "Field",
                                                name: {
                                                  kind: "Name",
                                                  value: "files",
                                                },
                                                selectionSet: {
                                                  kind: "SelectionSet",
                                                  selections: [
                                                    {
                                                      kind: "Field",
                                                      name: {
                                                        kind: "Name",
                                                        value: "filename",
                                                      },
                                                    },
                                                    {
                                                      kind: "Field",
                                                      name: {
                                                        kind: "Name",
                                                        value: "fileId",
                                                      },
                                                    },
                                                  ],
                                                },
                                              },
                                              {
                                                kind: "Field",
                                                name: {
                                                  kind: "Name",
                                                  value: "failed",
                                                },
                                                selectionSet: {
                                                  kind: "SelectionSet",
                                                  selections: [
                                                    {
                                                      kind: "Field",
                                                      name: {
                                                        kind: "Name",
                                                        value: "filename",
                                                      },
                                                    },
                                                    {
                                                      kind: "Field",
                                                      name: {
                                                        kind: "Name",
                                                        value: "error",
                                                      },
                                                    },
                                                  ],
                                                },
                                              },
                                            ],
                                          },
                                        },
                                      ],
                                    },
                                  },
                                  {
                                    kind: "InlineFragment",
                                    typeCondition: {
                                      kind: "NamedType",
                                      name: {
                                        kind: "Name",
                                        value: "AgentMessageStreamEventPart",
                                      },
                                    },
                                    selectionSet: {
                                      kind: "SelectionSet",
                                      selections: [
                                        {
                                          kind: "Field",
                                          name: { kind: "Name", value: "type" },
                                        },
                                        {
                                          kind: "Field",
                                          name: { kind: "Name", value: "data" },
                                          selectionSet: {
                                            kind: "SelectionSet",
                                            selections: [
                                              {
                                                kind: "Field",
                                                name: {
                                                  kind: "Name",
                                                  value: "eventType",
                                                },
                                              },
                                              {
                                                kind: "Field",
                                                name: {
                                                  kind: "Name",
                                                  value: "data",
                                                },
                                              },
                                            ],
                                          },
                                        },
                                      ],
                                    },
                                  },
                                  {
                                    kind: "InlineFragment",
                                    typeCondition: {
                                      kind: "NamedType",
                                      name: {
                                        kind: "Name",
                                        value: "AgentMessageErrorEventPart",
                                      },
                                    },
                                    selectionSet: {
                                      kind: "SelectionSet",
                                      selections: [
                                        {
                                          kind: "Field",
                                          name: { kind: "Name", value: "type" },
                                        },
                                        {
                                          kind: "Field",
                                          name: { kind: "Name", value: "data" },
                                          selectionSet: {
                                            kind: "SelectionSet",
                                            selections: [
                                              {
                                                kind: "Field",
                                                name: {
                                                  kind: "Name",
                                                  value: "message",
                                                },
                                              },
                                              {
                                                kind: "Field",
                                                name: {
                                                  kind: "Name",
                                                  value: "code",
                                                },
                                              },
                                            ],
                                          },
                                        },
                                      ],
                                    },
                                  },
                                  {
                                    kind: "InlineFragment",
                                    typeCondition: {
                                      kind: "NamedType",
                                      name: {
                                        kind: "Name",
                                        value: "AgentMessageUnknownEventPart",
                                      },
                                    },
                                    selectionSet: {
                                      kind: "SelectionSet",
                                      selections: [
                                        {
                                          kind: "Field",
                                          name: { kind: "Name", value: "type" },
                                        },
                                        {
                                          kind: "Field",
                                          name: { kind: "Name", value: "data" },
                                          selectionSet: {
                                            kind: "SelectionSet",
                                            selections: [
                                              {
                                                kind: "Field",
                                                name: {
                                                  kind: "Name",
                                                  value: "rawType",
                                                },
                                              },
                                              {
                                                kind: "Field",
                                                name: {
                                                  kind: "Name",
                                                  value: "rawSubtype",
                                                },
                                              },
                                              {
                                                kind: "Field",
                                                name: {
                                                  kind: "Name",
                                                  value: "data",
                                                },
                                              },
                                            ],
                                          },
                                        },
                                      ],
                                    },
                                  },
                                ],
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  SessionChatPageQueryQuery,
  SessionChatPageQueryQueryVariables
>;
export const SendSessionChatMessageMutationDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "SendSessionChatMessageMutation" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "input" },
          },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "SendSessionChatMessageInput" },
            },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "sendSessionChatMessage" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "input" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "input" },
                },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "status" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  SendSessionChatMessageMutationMutation,
  SendSessionChatMessageMutationMutationVariables
>;
export const SubmitSessionChatUserInputMutationDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "SubmitSessionChatUserInputMutation" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "input" },
          },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "SubmitSessionChatUserInputInput" },
            },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "submitSessionChatUserInput" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "input" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "input" },
                },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "ok" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  SubmitSessionChatUserInputMutationMutation,
  SubmitSessionChatUserInputMutationMutationVariables
>;
