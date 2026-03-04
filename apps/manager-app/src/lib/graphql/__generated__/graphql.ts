/* eslint-disable */
import type { TypedDocumentNode as DocumentNode } from "@graphql-typed-document-node/core";
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type Incremental<T> =
  | T
  | {
      [P in keyof T]?: P extends " $fragmentName" | "__typename" ? T[P] : never;
    };
/** Defined in: src/lib/agent-message-part-graphql-types.ts */
export type AgentMessageDynamicToolPartState =
  | "APPROVAL_REQUESTED"
  | "APPROVAL_RESPONDED"
  | "INPUT_AVAILABLE"
  | "INPUT_STREAMING"
  | "OUTPUT_AVAILABLE"
  | "OUTPUT_DENIED"
  | "OUTPUT_ERROR";

/** Defined in: src/lib/session-chat-types.ts */
export type AgentMessageMetadataProvider = "CLAUDE_AGENT_SDK";

/** Defined in: src/lib/session-chat-types.ts */
export type AgentMessageMetadataStatus = "DONE" | "ERROR" | "IN_PROGRESS";

/** Defined in: src/lib/session-chat-types.ts */
export type AgentMessageMetadataVisibility = "DEFAULT" | "TRACE";

/** Defined in: ../../node_modules/.pnpm/ai@6.0.97_zod@4.3.6/node_modules/ai/dist/index.d.ts */
export type AgentMessageReasoningPartState = "DONE" | "STREAMING";

/** Defined in: ../../node_modules/.pnpm/ai@6.0.97_zod@4.3.6/node_modules/ai/dist/index.d.ts */
export type AgentMessageRole = "ASSISTANT" | "SYSTEM" | "USER";

/** Defined in: ../../node_modules/.pnpm/ai@6.0.97_zod@4.3.6/node_modules/ai/dist/index.d.ts */
export type AgentMessageTextPartState = "DONE" | "STREAMING";

/** Defined in: src/server/graphql/schema/session.ts */
export type CreateSessionInput = {
  name?: string | null | undefined;
  repoRef?: string | null | undefined;
  repoUrl?: string | null | undefined;
};

/** Defined in: src/server/graphql/schema/session.ts */
export type ExecuteSessionInput = {
  cmd: string;
  cwd?: string | null | undefined;
  pty?: boolean | null | undefined;
  sessionId: string | number;
};

/** Defined in: src/server/graphql/schema/viewer.ts */
export type SaveClaudeApiKeyInput = {
  apiKey: string;
};

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

/** Defined in: src/server/graphql/schema/session.ts */
export type TerminateSessionInput = {
  sessionId: string | number;
};

export type ViewerQueryQueryVariables = Exact<{ [key: string]: never }>;

export type ViewerQueryQuery = {
  viewer: {
    claudeApiKeyConfigured: boolean;
    user: {
      id: string;
      github: {
        id: string;
        login: string;
        name: string | null;
        email: string | null;
        avatarUrl: string | null;
      };
    };
  } | null;
};

export type SessionsQueryQueryVariables = Exact<{ [key: string]: never }>;

export type SessionsQueryQuery = {
  sessions: Array<{
    id: string;
    name: string;
    repoUrl: string;
    repoRef: string;
    status: SessionStatus;
    workspacePath: string;
    createdAt: string;
    updatedAt: string;
    lastError: string | null;
  }>;
};

export type SessionDetailQueryQueryVariables = Exact<{
  id: string | number;
}>;

export type SessionDetailQueryQuery = {
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
    ssh: {
      user: string;
      host: string;
      port: number;
      hostKeyFingerprint: string;
      knownHostsEntry: string;
      command: string;
    } | null;
  } | null;
};

export type CreateSessionMutationMutationVariables = Exact<{
  input: CreateSessionInput;
}>;

export type CreateSessionMutationMutation = {
  createSession: {
    id: string;
    name: string;
    repoUrl: string;
    repoRef: string;
    status: SessionStatus;
    workspacePath: string;
    createdAt: string;
    updatedAt: string;
    lastError: string | null;
  };
};

export type SaveClaudeApiKeyMutationMutationVariables = Exact<{
  input: SaveClaudeApiKeyInput;
}>;

export type SaveClaudeApiKeyMutationMutation = {
  saveClaudeApiKey: { claudeApiKeyConfigured: boolean };
};

export type TerminateSessionMutationMutationVariables = Exact<{
  input: TerminateSessionInput;
}>;

export type TerminateSessionMutationMutation = {
  terminateSession: {
    id: string;
    name: string;
    repoUrl: string;
    repoRef: string;
    status: SessionStatus;
    workspacePath: string;
    createdAt: string;
    updatedAt: string;
    lastError: string | null;
  };
};

export type ExecuteSessionMutationMutationVariables = Exact<{
  input: ExecuteSessionInput;
}>;

export type ExecuteSessionMutationMutation = {
  executeSession: { stdout: string; stderr: string; exitCode: number };
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
          provider: AgentMessageMetadataProvider | null;
          providerSessionId: string | null;
          providerMessageType: string | null;
          providerSubtype: string | null;
          providerUuid: string | null;
          rawStoredMessageId: string | null;
        } | null;
        parts: Array<
          | {
              __typename: "AgentMessageDynamicToolPart";
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
              __typename: "AgentMessageEventPart";
              eventData:
                | {
                    __typename: "AgentMessageErrorEvent";
                    message: string;
                    code: string | null;
                  }
                | {
                    __typename: "AgentMessageFileBatchEvent";
                    processedAt: string | null;
                    files: Array<{ filename: string; fileId: string }>;
                    failed: Array<{ filename: string; error: string }>;
                  }
                | {
                    __typename: "AgentMessageStatusEvent";
                    subtype: string;
                    data: unknown;
                  }
                | {
                    __typename: "AgentMessageStreamEvent";
                    eventType: string | null;
                    data: unknown;
                  }
                | {
                    __typename: "AgentMessageToolProgressEvent";
                    toolUseId: string;
                    toolName: string;
                    elapsedSeconds: number;
                  }
                | {
                    __typename: "AgentMessageToolSummaryEvent";
                    summary: string;
                    precedingToolUseIds: Array<string>;
                  }
                | {
                    __typename: "AgentMessageUnknownEvent";
                    rawType: string;
                    rawSubtype: string | null;
                    data: unknown;
                  }
                | null;
            }
          | {
              __typename: "AgentMessageReasoningPart";
              text: string;
              reasoningState: AgentMessageReasoningPartState | null;
            }
          | {
              __typename: "AgentMessageResultPart";
              resultData: {
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
              __typename: "AgentMessageTextPart";
              text: string;
              textState: AgentMessageTextPartState | null;
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

export const ViewerQueryDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "ViewerQuery" },
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "viewer" },
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                {
                  kind: "Field",
                  name: { kind: "Name", value: "claudeApiKeyConfigured" },
                },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "user" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "github" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            {
                              kind: "Field",
                              name: { kind: "Name", value: "id" },
                            },
                            {
                              kind: "Field",
                              name: { kind: "Name", value: "login" },
                            },
                            {
                              kind: "Field",
                              name: { kind: "Name", value: "name" },
                            },
                            {
                              kind: "Field",
                              name: { kind: "Name", value: "email" },
                            },
                            {
                              kind: "Field",
                              name: { kind: "Name", value: "avatarUrl" },
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
} as unknown as DocumentNode<ViewerQueryQuery, ViewerQueryQueryVariables>;
export const SessionsQueryDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "SessionsQuery" },
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "sessions" },
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
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SessionsQueryQuery, SessionsQueryQueryVariables>;
export const SessionDetailQueryDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "SessionDetailQuery" },
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
                  name: { kind: "Name", value: "ssh" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "user" } },
                      { kind: "Field", name: { kind: "Name", value: "host" } },
                      { kind: "Field", name: { kind: "Name", value: "port" } },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "hostKeyFingerprint" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "knownHostsEntry" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "command" },
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
  SessionDetailQueryQuery,
  SessionDetailQueryQueryVariables
>;
export const CreateSessionMutationDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "CreateSessionMutation" },
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
              name: { kind: "Name", value: "CreateSessionInput" },
            },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "createSession" },
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
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  CreateSessionMutationMutation,
  CreateSessionMutationMutationVariables
>;
export const SaveClaudeApiKeyMutationDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "SaveClaudeApiKeyMutation" },
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
              name: { kind: "Name", value: "SaveClaudeApiKeyInput" },
            },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "saveClaudeApiKey" },
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
                {
                  kind: "Field",
                  name: { kind: "Name", value: "claudeApiKeyConfigured" },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  SaveClaudeApiKeyMutationMutation,
  SaveClaudeApiKeyMutationMutationVariables
>;
export const TerminateSessionMutationDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "TerminateSessionMutation" },
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
              name: { kind: "Name", value: "TerminateSessionInput" },
            },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "terminateSession" },
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
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  TerminateSessionMutationMutation,
  TerminateSessionMutationMutationVariables
>;
export const ExecuteSessionMutationDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "ExecuteSessionMutation" },
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
              name: { kind: "Name", value: "ExecuteSessionInput" },
            },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "executeSession" },
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
                { kind: "Field", name: { kind: "Name", value: "stdout" } },
                { kind: "Field", name: { kind: "Name", value: "stderr" } },
                { kind: "Field", name: { kind: "Name", value: "exitCode" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  ExecuteSessionMutationMutation,
  ExecuteSessionMutationMutationVariables
>;
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
                                        value: "AgentMessageEventPart",
                                      },
                                    },
                                    selectionSet: {
                                      kind: "SelectionSet",
                                      selections: [
                                        {
                                          kind: "Field",
                                          alias: {
                                            kind: "Name",
                                            value: "eventData",
                                          },
                                          name: { kind: "Name", value: "data" },
                                          selectionSet: {
                                            kind: "SelectionSet",
                                            selections: [
                                              {
                                                kind: "Field",
                                                name: {
                                                  kind: "Name",
                                                  value: "__typename",
                                                },
                                              },
                                              {
                                                kind: "InlineFragment",
                                                typeCondition: {
                                                  kind: "NamedType",
                                                  name: {
                                                    kind: "Name",
                                                    value:
                                                      "AgentMessageToolProgressEvent",
                                                  },
                                                },
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
                                              {
                                                kind: "InlineFragment",
                                                typeCondition: {
                                                  kind: "NamedType",
                                                  name: {
                                                    kind: "Name",
                                                    value:
                                                      "AgentMessageToolSummaryEvent",
                                                  },
                                                },
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
                                                        value:
                                                          "precedingToolUseIds",
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
                                                      "AgentMessageStatusEvent",
                                                  },
                                                },
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
                                              {
                                                kind: "InlineFragment",
                                                typeCondition: {
                                                  kind: "NamedType",
                                                  name: {
                                                    kind: "Name",
                                                    value:
                                                      "AgentMessageFileBatchEvent",
                                                  },
                                                },
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
                                              {
                                                kind: "InlineFragment",
                                                typeCondition: {
                                                  kind: "NamedType",
                                                  name: {
                                                    kind: "Name",
                                                    value:
                                                      "AgentMessageStreamEvent",
                                                  },
                                                },
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
                                              {
                                                kind: "InlineFragment",
                                                typeCondition: {
                                                  kind: "NamedType",
                                                  name: {
                                                    kind: "Name",
                                                    value:
                                                      "AgentMessageErrorEvent",
                                                  },
                                                },
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
                                              {
                                                kind: "InlineFragment",
                                                typeCondition: {
                                                  kind: "NamedType",
                                                  name: {
                                                    kind: "Name",
                                                    value:
                                                      "AgentMessageUnknownEvent",
                                                  },
                                                },
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
                                  {
                                    kind: "InlineFragment",
                                    typeCondition: {
                                      kind: "NamedType",
                                      name: {
                                        kind: "Name",
                                        value: "AgentMessageResultPart",
                                      },
                                    },
                                    selectionSet: {
                                      kind: "SelectionSet",
                                      selections: [
                                        {
                                          kind: "Field",
                                          alias: {
                                            kind: "Name",
                                            value: "resultData",
                                          },
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
