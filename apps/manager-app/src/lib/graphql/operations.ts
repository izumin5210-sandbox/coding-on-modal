import { graphql } from "@/lib/graphql/__generated__";

export const viewerDocument = graphql(`
  query ViewerQuery {
    viewer {
      claudeApiKeyConfigured
      user {
        id
        github {
          id
          login
          name
          email
          avatarUrl
        }
      }
    }
  }
`);

export const sessionsDocument = graphql(`
  query SessionsQuery {
    sessions {
      id
      name
      repoUrl
      repoRef
      status
      workspacePath
      createdAt
      updatedAt
      lastError
    }
  }
`);

export const sessionDetailDocument = graphql(`
  query SessionDetailQuery($id: ID!) {
    session(id: $id) {
      id
      name
      repoUrl
      repoRef
      status
      workspacePath
      createdAt
      updatedAt
      lastError
      ssh {
        user
        host
        port
        hostKeyFingerprint
        knownHostsEntry
        command
      }
    }
  }
`);

export const createSessionDocument = graphql(`
  mutation CreateSessionMutation($input: CreateSessionInput!) {
    createSession(input: $input) {
      id
      name
      repoUrl
      repoRef
      status
      workspacePath
      createdAt
      updatedAt
      lastError
    }
  }
`);

export const saveClaudeApiKeyDocument = graphql(`
  mutation SaveClaudeApiKeyMutation($input: SaveClaudeApiKeyInput!) {
    saveClaudeApiKey(input: $input) {
      claudeApiKeyConfigured
    }
  }
`);

export const terminateSessionDocument = graphql(`
  mutation TerminateSessionMutation($input: TerminateSessionInput!) {
    terminateSession(input: $input) {
      id
      name
      repoUrl
      repoRef
      status
      workspacePath
      createdAt
      updatedAt
      lastError
    }
  }
`);

export const executeSessionDocument = graphql(`
  mutation ExecuteSessionMutation($input: ExecuteSessionInput!) {
    executeSession(input: $input) {
      stdout
      stderr
      exitCode
    }
  }
`);

export const sessionChatPageDocument = graphql(`
  query SessionChatPageQuery($id: ID!) {
    session(id: $id) {
      id
      name
      repoUrl
      repoRef
      status
      workspacePath
      createdAt
      updatedAt
      lastError
      chat {
        rawCount
        thread {
          id
          sessionId
          claudeSdkSessionId
          cwd
          maxTurns
          isRunning
          lastError
          createdAt
          updatedAt
        }
        pendingUserInput {
          __typename
          ... on SessionChatAskUserQuestionPendingRequest {
            requestId
            toolName
            toolUseId
            kind
            createdAt
            input
            decisionReason
            blockedPath
            agentId
            suggestions
            questions {
              header
              question
              multiSelect
              options {
                label
                description
              }
            }
          }
          ... on SessionChatToolApprovalPendingRequest {
            requestId
            toolName
            toolUseId
            kind
            createdAt
            input
            decisionReason
            blockedPath
            agentId
            suggestions
          }
        }
        messages {
          id
          role
          metadata {
            createdAt
            updatedAt
            visibility
            status
            label
            isReplay
            isSynthetic
            parentToolUseId
            provider
            providerSessionId
            providerMessageType
            providerSubtype
            providerUuid
            rawStoredMessageId
          }
          parts {
            __typename
            ... on AgentMessageTextPart {
              type
              text
              textState: state
            }
            ... on AgentMessageReasoningPart {
              type
              text
              reasoningState: state
            }
            ... on AgentMessageDynamicToolPart {
              type
              toolName
              toolCallId
              title
              providerExecuted
              toolState: state
              input
              output
              errorText
              preliminary
              approval {
                id
                approved
                reason
              }
            }
            ... on AgentMessageToolProgressPart {
              type
              data {
                toolUseId
                toolName
                elapsedSeconds
              }
            }
            ... on AgentMessageToolSummaryPart {
              type
              data {
                summary
                precedingToolUseIds
              }
            }
            ... on AgentMessageRunResultPart {
              type
              data {
                subtype
                isError
                summaryText
                metrics {
                  durationMs
                  durationApiMs
                  numTurns
                  totalCostUsd
                }
              }
            }
            ... on AgentMessageStatusEventPart {
              type
              data {
                subtype
                data
              }
            }
            ... on AgentMessageFileBatchPart {
              type
              data {
                processedAt
                files {
                  filename
                  fileId
                }
                failed {
                  filename
                  error
                }
              }
            }
            ... on AgentMessageStreamEventPart {
              type
              data {
                eventType
                data
              }
            }
            ... on AgentMessageErrorEventPart {
              type
              data {
                message
                code
              }
            }
            ... on AgentMessageUnknownEventPart {
              type
              data {
                rawType
                rawSubtype
                data
              }
            }
          }
        }
      }
    }
  }
`);

export const sendSessionChatMessageDocument = graphql(`
  mutation SendSessionChatMessageMutation($input: SendSessionChatMessageInput!) {
    sendSessionChatMessage(input: $input) {
      status
    }
  }
`);

export const submitSessionChatUserInputDocument = graphql(`
  mutation SubmitSessionChatUserInputMutation(
    $input: SubmitSessionChatUserInputInput!
  ) {
    submitSessionChatUserInput(input: $input) {
      ok
    }
  }
`);
