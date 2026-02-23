# Technical Steering

## Architecture
- Implement frontend/backend in `apps/manager-app` using Next.js App Router.
- Use Modal Sandbox as the session runtime, and standardize public APIs under `/api/sessions/*`.
- Manage session state in a local SQLite DB (`SESSION_DB_PATH`) through Drizzle ORM.

## Runtime Strategy
- Build the Modal image on a Node.js base and use `/workspace` as the working directory.
- Execute agents inside sessions via `@anthropic-ai/claude-agent-sdk`.
- Adopt an API-driven execution model instead of a persistent terminal relay such as `ttyd`.
- Avoid a persistent sandbox-internal root daemon for `exec` / agent orchestration.
- Execute Session `exec` operations directly from `manager-app` via Modal `sandbox.exec`, under the authenticated user's GitHub-correlated Linux user.
- Execute Session agent operations from `manager-app` via Claude Agent SDK, using `spawnClaudeCodeProcess` to launch Claude Code inside the Session under the authenticated user's GitHub-correlated Linux user.
- Use a manager-side adapter to bridge Modal `sandbox.exec` process handles (Web Streams) to the Claude Agent SDK `SpawnedProcess` interface.
- Treat agent cancellation as best-effort via a secondary kill command in the Session until Modal exposes a per-exec termination API.
- Use Drizzle ORM v1 beta for typed schema and queries.
- Keep runtime path focused on DB access only; run schema migration explicitly with `drizzle-kit migrate`.
- Expose Session SSH port via Modal tunnel and run `sshd` inside each Session for direct CLI login.
- Include baseline CLI utilities in the Session image (for example, `curl`) and install `sudo`.
- Preinstall Claude Code CLI in the Session image and pin it to a known-good version (`2.1.29`) while disabling auto-update to avoid TUI regressions from newer releases.
- In the future, enable the same agent execution foundation to be called from non-Web channels (for example, Slack).

## Authentication Strategy (Current Phase)
- Implement custom GitHub OAuth login (`state` + PKCE) and issue app session JWT in HttpOnly cookie.
- Persist app users in `users`; persist GitHub profile in `github_accounts`; persist encrypted OAuth tokens in `github_credentials`; persist encrypted Claude token in `claude_credentials`.
- Protect all `/api/sessions/*` endpoints with authentication and enforce owner-only access by `sessions.owner_user_id`.
- Use authenticated user's GitHub OAuth token when cloning repositories (public/private), injected via `GIT_ASKPASS` to avoid token leakage in command arguments.
- Request `read:user user:email repo read:org gist` GitHub OAuth scopes to support Session bootstrap with `gh auth`.
- Initialize GitHub authentication in each Session using `gh auth login --with-token` and `gh auth setup-git` for `github.com` over HTTPS, then rely on git credential helper integration for clone/fetch/pull/push.
- Fetch GitHub public keys for the authenticated user's login at Session creation time and apply them to Session `authorized_keys` for SSH login.
- Grant the Session SSH user passwordless `sudo` to allow package installation and local system setup during interactive SSH usage.
- If a per-user Claude token is configured, write shell startup exports for `ANTHROPIC_AUTH_TOKEN` (and compatibility `CLAUDE_CODE_OAUTH_TOKEN`) in the Session SSH user's shell profile.
- When the GitHub token is updated, apply the new token to newly created Sessions only; existing running Sessions keep their previously initialized credentials until recreated.
- Require per-user Claude token for Claude Agent SDK execution; do not use environment-variable fallback tokens.

## API & Naming Rules
- Standardize public naming on `Session` and use `/sessions` route semantics.
- Avoid exposing Modal-specific concepts excessively in UI/API.
- Acquire `db` in API handlers and pass it into service/store layers via dependency injection.
- Return SSH connection metadata from Session detail API (`GET /api/sessions/{id}`) and keep list API lightweight.
- Keep the sandbox-internal execution runtime private to `manager-app` orchestration paths, and do not expose it as a public user-facing API surface.
- Treat Session execution orchestration internals as private; invocation parameters and adapters may require execution-context fields such as Linux user identity.

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
