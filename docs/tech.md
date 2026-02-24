# Technical Steering

## Architecture
- Implement frontend/backend in `apps/manager-app` using Next.js App Router.
- Use Modal Sandbox as the session runtime, and standardize public APIs under `/api/sessions/*`.
- Manage session state in a local SQLite DB (`SESSION_DB_PATH`) through Drizzle ORM.

## Runtime Strategy
- Build the Modal image on a Node.js base and use `/workspace` as the working directory.
- Execute `@anthropic-ai/claude-agent-sdk` in `manager-api` and delegate Claude Code CLI process spawning to the Session runtime via `spawnClaudeCodeProcess`.
- Adopt an API-driven execution model instead of a persistent terminal relay such as `ttyd`.
- Implement Session chat interactions via API endpoints (`/api/sessions/{id}/chat`) and render them in a dedicated Web chat page.
- Use Drizzle ORM v1 beta for typed schema and queries.
- Keep runtime path focused on DB access only; run schema migration explicitly with `drizzle-kit migrate`.
- Expose Session SSH port via Modal tunnel and run `sshd` inside each Session for direct CLI login.
- Include baseline CLI utilities in the Session image (for example, `curl`) and install `sudo`.
- Preinstall Claude Code CLI in the Session image and pin it to a known-good version (`2.1.29`) while disabling auto-update to avoid TUI regressions from newer releases; pin the manager-side Claude Agent SDK to the matching compatible version (`@anthropic-ai/claude-agent-sdk@0.2.29`) and keep a matching SDK package in the Session image only as the spawned Claude process entrypoint (`cli.js`) for remote execution.
- In the future, enable the same agent execution foundation to be called from non-Web channels (for example, Slack).
- Persist Claude Code chat transcripts server-side in SQLite as raw Claude Agent SDK `SDKMessage` JSON records, with UI-oriented shaping performed at read time.
- Return Session chat messages from the API in a generalized `role + parts[] + metadata` schema (inspired by Vercel AI SDK `UIMessage`) instead of exposing Claude Agent SDK transport message shapes directly.
- Build the Session chat Web UI with Vercel AI Elements primitives (for example `Conversation`, `Message`, `PromptInput`) and adapt them to the app's generalized chat message schema.
- Support multi-turn Session chat continuity by resuming Claude Code conversations using Claude Agent SDK `query()` with stored SDK session IDs.

## Authentication Strategy (Current Phase)
- Implement custom GitHub OAuth login (`state` + PKCE) and issue app session JWT in HttpOnly cookie.
- Persist app users in `users`; persist GitHub profile in `github_accounts`; persist encrypted OAuth tokens in `github_credentials`; persist encrypted Claude API key in `claude_credentials`.
- Protect all `/api/sessions/*` endpoints with authentication and enforce owner-only access by `sessions.owner_user_id`.
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
- Standardize public naming on `Session` and use `/sessions` route semantics.
- Avoid exposing Modal-specific concepts excessively in UI/API.
- Acquire `db` in API handlers and pass it into service/store layers via dependency injection.
- Return SSH connection metadata from Session detail API (`GET /api/sessions/{id}`) and keep list API lightweight.

## Operational Constraints
- Fail fast with explicit errors when required environment variables are missing.
- Implement session operations (`terminate`/`delete`) with idempotency in mind.
- Control global/idle timeout values through environment variables.

## Near-Term Technical Priorities
- Add explicit JWT revoke/session invalidation mechanism when immediate logout invalidation is required.
- Add GitHub OAuth token refresh flow and recovery handling for expired credentials.
- Add retention policy for audit logs and execution history.
- Decouple agent execution APIs from chat input channels to support channel expansion.
- Add host key rotation and key re-sync controls for long-running Sessions.
- Define migration automation strategy for deployment environments.
