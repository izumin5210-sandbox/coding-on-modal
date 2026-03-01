# gqlkit-based Manager API Design

## Goal
- Replace the current manager REST API for authenticated app operations with a GraphQL API built with `gqlkit`.
- Keep public naming on `Session`.
- Reuse AI SDK `UIMessage` as the exported agent message object type instead of maintaining a custom chat message envelope.

## gqlkit Findings
- `gqlkit` is a TypeScript-first, code-first GraphQL toolkit. Exported TypeScript types become schema types, and exported functions become schema fields/resolvers.
- Query and Mutation roots are defined from exported functions, so schema naming should follow stable public field names from the start.
- Input object generation follows TypeScript type shapes. Types with the `Input` suffix are treated as GraphQL input objects, and `oneOf` inputs are also supported when needed.
- Object types can be derived from existing TypeScript types instead of writing schema DSL by hand. This fits the current codebase, which already has stable service-layer return types and Drizzle row/select types.
- `gqlkit` integrates cleanly with GraphQL Yoga, which fits the current Next.js route-handler architecture.
- Drizzle inferred types can be exported directly, which makes it practical to keep DB/store types and GraphQL types close without duplicating models.

Sources:
- https://gqlkit.izumin.dev/what-is-gqlkit
- https://gqlkit.izumin.dev/schema/conventions
- https://gqlkit.izumin.dev/schema/objects
- https://gqlkit.izumin.dev/schema/queries-mutations
- https://gqlkit.izumin.dev/integration/drizzle
- https://gqlkit.izumin.dev/integration/graphql-yoga

## Design Principles
- Use GraphQL only for authenticated manager application operations.
- Keep redirect/webhook style endpoints as REST: GitHub OAuth login/callback, logout cookie clearing, Slack webhook ingestion, and Slack link callback.
- Preserve the existing service layer as the execution boundary. GraphQL should replace HTTP route glue, not rewrite session/chat orchestration.
- Keep the current asynchronous chat model: submitting a prompt starts a durable workflow and returns immediately; the client keeps polling chat state.
- Make `UIMessage` the canonical chat message shape and move non-standard fields into `metadata` or typed `data-*` parts.

## Proposed Endpoint Boundary
- New GraphQL endpoint: `/api/graphql`
- Retained REST endpoints:
  - `/api/auth/github/login`
  - `/api/auth/github/callback`
  - `/api/auth/logout`
  - `/api/webhooks/[platform]`
  - `/api/slack/link`

## Proposed Schema Shape

### Root Query
```graphql
type Query {
  viewer: Viewer
  sessions: [Session!]!
  session(id: ID!): Session
}
```

### Root Mutation
```graphql
type Mutation {
  createSession(input: CreateSessionInput!): CreateSessionPayload!
  terminateSession(id: ID!): UpdateSessionPayload!
  deleteSession(id: ID!): DeleteSessionPayload!
  executeSessionCommand(input: ExecuteSessionCommandInput!): ExecuteSessionCommandPayload!
  saveClaudeApiKey(input: SaveClaudeApiKeyInput!): SaveClaudeApiKeyPayload!
  sendSessionChatMessage(input: SendSessionChatMessageInput!): SendSessionChatMessagePayload!
  submitSessionChatUserInput(input: SubmitSessionChatUserInputInput!): SubmitSessionChatUserInputPayload!
}
```

### Core Object Types
```graphql
type Viewer {
  user: AuthUser!
  claudeApiKeyConfigured: Boolean!
}

type Session {
  id: ID!
  name: String!
  repoUrl: String!
  repoRef: String!
  status: SessionStatus!
  workspacePath: String!
  createdAt: DateTime!
  updatedAt: DateTime!
  lastError: String
  ssh: SessionSshInfo
  chat: SessionChat!
}

type SessionChat {
  thread: SessionChatThread!
  messages: [AgentMessage!]!
  rawCount: Int!
  pendingUserInput: SessionChatPendingUserInput
}
```

### Chat Message Model
The message type should be exported as AI SDK `UIMessage`, not redefined:

```ts
import type { UIMessage } from "ai";

export type AgentMessageMetadata = {
  createdAt: DateTime;
  updatedAt: DateTime;
  visibility?: "default" | "trace";
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
    metrics?: {
      durationMs?: number;
      durationApiMs?: number;
      numTurns?: number;
      totalCostUsd?: number;
    };
  };
  status_event: {
    subtype: string;
    data: JSON;
  };
  file_batch: {
    files: { filename: string; fileId: string }[];
    failed: { filename: string; error: string }[];
    processedAt?: DateTime;
  };
  error_event: {
    message: string;
    code?: string;
  };
  unknown_event: {
    rawType: string;
    rawSubtype?: string;
    data: JSON;
  };
};

export type AgentMessage = UIMessage<AgentMessageMetadata, AgentMessageData, {}>;
```

### Why this shape
- `UIMessage` already matches the rendering model used by AI SDK UI components.
- `dynamic-tool` can replace the current custom `tool-call` and `tool-result` message parts for the main tool lifecycle.
- Existing trace/status/result payloads fit naturally into typed `data-*` parts.
- `UIMessage` does not include timestamps, so `createdAt` and `updatedAt` should move into `metadata`. This is an intentional adaptation to keep the top-level object exactly `UIMessage`.

## Pending User Input Model
- Keep pending user input outside `AgentMessage`; it represents broker state, not a persisted transcript message.
- Use a union/object split equivalent to the current model:
  - `SessionChatToolApproval`
  - `SessionChatAskUserQuestion`
- For GraphQL input, avoid `string | string[]`. Use a normalized list form:

```graphql
input SessionChatUserAnswerInput {
  key: String!
  values: [String!]!
}
```

This avoids GraphQL input unions and keeps resolver logic simple.

## Scalars
- `DateTime`: ISO-8601 string scalar.
- `JSON`: arbitrary JSON payload scalar for tool input/output, provider metadata, and trace payloads.

Inference:
- The official docs clearly support custom scalars, but they do not prescribe a built-in JSON scalar. A custom `JSON` scalar should therefore be part of the manager schema design.

## Resolver and Context Design
- Build a GraphQL context that contains:
  - `db`
  - `request`
  - `viewer` or `null`
- `viewer` query returns `null` when the session cookie is absent or invalid.
- All other manager operations require authentication and throw GraphQL errors with extensions instead of returning REST-style `{ error }`.
- Reuse existing service functions directly:
  - `listSessionRecords`
  - `getSessionRecord`
  - `createSession`
  - `terminateSessionRecord`
  - `deleteSessionRecord`
  - `executeInSession`
  - `getSessionClaudeChat`
  - `sendSessionClaudeChatMessage`
  - `submitSessionClaudeChatUserInput`

## Error Mapping
- Map `AuthError` to `UNAUTHENTICATED`.
- Map `SessionError` by status:
  - `404` -> `NOT_FOUND`
  - `409` -> `CONFLICT`
  - `400` -> `BAD_USER_INPUT`
- Map `ZodError` to `BAD_USER_INPUT` with field details in `extensions.validationIssues`.
- Keep GraphQL HTTP responses on the GraphQL transport path and move status semantics into `extensions`.

## Recommended Module Layout
```text
apps/manager-app/src/app/api/graphql/route.ts
apps/manager-app/src/server/graphql/context.ts
apps/manager-app/src/server/graphql/errors.ts
apps/manager-app/src/server/graphql/scalars.ts
apps/manager-app/src/server/graphql/viewer.ts
apps/manager-app/src/server/graphql/session.ts
apps/manager-app/src/server/graphql/session-chat.ts
apps/manager-app/src/server/graphql/agent-message.ts
apps/manager-app/src/server/graphql/index.ts
apps/manager-app/graphql/schema.graphql
```

Notes:
- `route.ts` hosts Yoga and creates the gqlkit schema.
- `agent-message.ts` owns the exported `UIMessage` alias and the typed `data-*` payloads.
- Existing REST route handlers should be removed only after the UI is switched over.

## Migration Plan

### Phase 1: Normalize chat contracts before GraphQL
- Replace `SessionChatMessage` in `src/lib/session-chat-types.ts` with the exported `AgentMessage` alias based on `UIMessage`.
- Update chat shaping in `claude-chat-service.ts` to emit:
  - `text`
  - `reasoning` when available
  - `dynamic-tool`
  - typed `data-*` parts for trace/result/status payloads
- Update the chat UI to read `UIMessage` parts instead of the current custom part union.

### Phase 2: Introduce GraphQL infrastructure
- Add gqlkit schema modules and Yoga route.
- Add GraphQL context/auth/error utilities.
- Add custom scalars for `DateTime` and `JSON`.
- Generate and commit the schema artifact used for review and client typing.

### Phase 3: Add read operations
- Implement `viewer`, `sessions`, and `session`.
- Implement `Session.chat` as a field resolver backed by `getSessionClaudeChat`.
- Switch the Session list/detail/chat page reads from REST fetches to GraphQL queries.

### Phase 4: Add mutations
- Implement the seven mutations listed above.
- Switch the home page actions and chat actions from REST to GraphQL mutations.
- Keep polling behavior unchanged by polling the `session(id).chat` selection set.

### Phase 5: Remove replaced REST manager routes
- Remove:
  - `/api/me`
  - `/api/claude-token`
  - `/api/sessions`
  - `/api/sessions/[id]`
  - `/api/sessions/[id]/terminate`
  - `/api/sessions/[id]/exec`
  - `/api/sessions/[id]/chat`
  - `/api/sessions/[id]/chat/user-input`
- Keep auth and webhook endpoints as REST.

### Phase 6: Stabilize and tighten
- Add schema snapshot checks.
- Add end-to-end tests for GraphQL auth/error behavior.
- Remove leftover REST response types from `src/lib`.

## Risks and Decisions
- Exposing raw `UIMessage` means the `parts` union becomes broad. This is acceptable only if we constrain the generic parameters and avoid unbounded typed tool maps.
- `UIMessage` has no top-level timestamp fields. Keeping timestamps in `metadata` is the least invasive option and preserves the requirement to export `UIMessage` itself.
- GraphQL subscriptions are not required for the first migration. The existing async submission plus polling model already matches current workflow semantics.
- Message pagination is intentionally deferred. The current API already returns the full transcript, and changing that at the same time as the transport migration would add avoidable risk.
