# Technical Steering

## Architecture
- Implement frontend/backend in `apps/manager-app` using Next.js App Router.
- Use Modal Sandbox as the session runtime.
- Expose authenticated manager operations through a GraphQL API at `/api/graphql`, implemented with `gqlkit` and GraphQL Yoga.
- Keep redirect/webhook-oriented endpoints (`/api/auth/*`, `/api/webhooks/*`, `/api/slack/link`) as REST handlers.
- Manage session state in a local SQLite DB (`SESSION_DB_PATH`) through Drizzle ORM.

## Runtime Strategy
- Build the Modal image on a Node.js base and use `/workspace` as the working directory.
- Execute Claude Agent SDK V1 `query()` inside the Session sandbox via a **broker HTTP server** (port 8765), orchestrated by a **durable workflow** (Workflow DevKit) running in manager-app.
- The broker provides SSE-streamed Claude execution with a state machine (`idle → running → waiting_for_approval`) and handles `canUseTool` user-feedback interception.
- The workflow (`sessionChatTurnWorkflow`) manages one Claude turn per prompt: broker SSE reading → DB message persistence → approval hook loop → lock release.
- Adopt an API-driven execution model instead of a persistent terminal relay such as `ttyd`.
- Implement Session chat interactions through GraphQL mutations and queries; prompt submission remains **asynchronous** and the client continues polling chat state for updates.
- Use Drizzle ORM v1 beta for typed schema and queries.
- Keep runtime path focused on DB access only; run schema migration explicitly with `drizzle-kit migrate`.
- Expose Session SSH port via Modal tunnel and run `sshd` inside each Session for direct CLI login.
- Include baseline CLI utilities in the Session image (for example, `curl`) and install `sudo`.
- Preinstall Claude Code CLI in the Session image and pin it to a known-good version (`2.1.29`) while disabling auto-update to avoid TUI regressions from newer releases; pin the manager-side Claude Agent SDK to the matching compatible version (`@anthropic-ai/claude-agent-sdk@0.2.29`) and keep a matching SDK package in the Session image only as the spawned Claude process entrypoint (`cli.js`) for remote execution.
- Slack integration uses Chat SDK (`chat` + `@chat-adapter/slack`) for incoming webhook handling and Redis (`@chat-adapter/state-redis`) for thread subscription state. Outgoing messages from the workflow use the Chat SDK Slack adapter (`getBot().getAdapter('slack')`) to keep all Slack API access centralised through the Chat SDK abstraction layer.
- The durable workflow (`sessionChatTurnWorkflow`) includes a `notifySlack` step after each `persistMessages` call: it checks for a `slack_thread_sessions` mapping by session ID and posts SDK messages / approval cards to the linked Slack thread.
- Session creation from Slack reuses the existing `createSession()` and `sendSessionClaudeChatMessage()` service functions — Slack is an alternative input channel, not a parallel implementation.
- Slack user ↔ app user binding uses a one-time link token flow: the bot sends an ephemeral message with a URL; the user authenticates via existing GitHub OAuth and the mapping is stored in `slack_user_mappings`.
- Persist Claude Code chat transcripts server-side in SQLite as raw Claude Agent SDK `SDKMessage` JSON records, with UI-oriented shaping performed at read time.
- Export agent messages in the GraphQL schema as AI SDK `UIMessage<Metadata, DataParts, {}>` object types instead of maintaining a separate custom message envelope.
- Model tool invocations/results in the chat API as AI SDK-style `dynamic-tool` parts (stateful `input-*` / `output-*`) and move trace/result/status payloads into typed `data-*` parts so the Web UI can render against AI SDK-native message contracts.
- Build the Session chat Web UI with Vercel AI Elements primitives (for example `Conversation`, `Message`, `PromptInput`) and adapt them to the app's generalized chat message schema.
- Support multi-turn Session chat continuity by resuming Claude Code conversations using Claude Agent SDK `query()` with stored SDK session IDs.
- Use Workflow DevKit (useworkflow.dev) Local World for durable orchestration; wrap `next.config.ts` with `withWorkflow()`.
- Derive approval hook tokens deterministically from session ID + tool use ID (`session:{sessionId}:approval:{toolUseId}`), eliminating the need for DB-persisted workflow state.
- Resolve broker tunnel URL on-demand via Modal API (`sandbox.tunnels()`) instead of persisting it.
- Add custom GraphQL scalars for ISO `DateTime` values and arbitrary `JSON` payloads used by chat message parts and broker state.

## Authentication Strategy (Current Phase)
- Implement custom GitHub OAuth login (`state` + PKCE) and issue app session JWT in HttpOnly cookie.
- Persist app users in `users`; persist GitHub profile in `github_accounts`; persist encrypted OAuth tokens in `github_credentials`; persist encrypted Claude API key in `claude_credentials`.
- Protect authenticated manager GraphQL operations with session-cookie auth and enforce owner-only access by `sessions.owner_user_id`; allow `viewer` to return `null` when unauthenticated.
- Use authenticated user's GitHub OAuth token when cloning repositories (public/private), injected via `GIT_ASKPASS` to avoid token leakage in command arguments.
- Request `read:user user:email repo read:org gist` GitHub OAuth scopes to support Session bootstrap with `gh auth`.
- Initialize GitHub authentication in each Session using `gh auth login --with-token` and `gh auth setup-git` for `github.com` over HTTPS, then rely on git credential helper integration for clone/fetch/pull/push.
- Fetch GitHub public keys for the authenticated user's login at Session creation time and apply them to Session `authorized_keys` for SSH login.
- Grant the Session SSH user passwordless `sudo` to allow package installation and local system setup during interactive SSH usage.
- If a per-user Claude API key is configured, write shell startup export for `ANTHROPIC_API_KEY` in the Session SSH user's shell profile.
- Run Claude Code for agent execution as the Session SSH Linux user (mapped from the authenticated user's GitHub login) so file ownership and interactive SSH usage remain aligned.
- When the GitHub token is updated, apply the new token to newly created Sessions only; existing running Sessions keep their previously initialized credentials until recreated.
- Require per-user Claude API key for Claude Agent SDK execution; do not use environment-variable fallback credentials.

## API & Naming Rules
- Standardize public naming on `Session`.
- Avoid exposing Modal-specific concepts excessively in UI/API.
- Acquire `db` in the GraphQL context and pass it into service/store layers via dependency injection.
- Return SSH connection metadata from the `Session.ssh` field and keep list queries lightweight unless the client explicitly selects that field.
- Map domain/auth/validation failures to GraphQL errors with typed `extensions` instead of REST-style status-code JSON envelopes.

## Operational Constraints
- Fail fast with explicit errors when required environment variables are missing.
- Implement session operations (`terminate`/`delete`) with idempotency in mind.
- Control global/idle timeout values through environment variables.

## Near-Term Technical Priorities
- Add explicit JWT revoke/session invalidation mechanism when immediate logout invalidation is required.
- Add GitHub OAuth token refresh flow and recovery handling for expired credentials.
- Add retention policy for audit logs and execution history.
- Add host key rotation and key re-sync controls for long-running Sessions.
- Define migration automation strategy for deployment environments.
- Add Slack `ask-user-question` modal flow (currently only Allow/Deny buttons are supported).
