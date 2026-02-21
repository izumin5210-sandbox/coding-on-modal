# Technical Steering

## Architecture
- Implement frontend/backend in `apps/manager-app` using Next.js App Router.
- Use Modal Sandbox as the session runtime, and standardize public APIs under `/api/sessions/*`.
- Manage session state in a local SQLite DB (`SESSION_DB_PATH`) through Drizzle ORM.

## Runtime Strategy
- Build the Modal image on a Node.js base and use `/workspace` as the working directory.
- Execute agents inside sessions via `@anthropic-ai/claude-agent-sdk`.
- Adopt an API-driven execution model instead of a persistent terminal relay such as `ttyd`.
- Use Drizzle ORM v1 beta for typed schema and queries.
- Keep runtime path focused on DB access only; run schema migration explicitly with `drizzle-kit migrate`.
- Expose Session SSH port via Modal tunnel and run `sshd` inside each Session for direct CLI login.
- In the future, enable the same agent execution foundation to be called from non-Web channels (for example, Slack).

## Authentication Strategy (Current Phase)
- Implement custom GitHub OAuth login (`state` + PKCE) and issue app session JWT in HttpOnly cookie.
- Persist app users in `users`; persist GitHub profile in `github_accounts`; persist encrypted OAuth tokens in `github_credentials`; persist encrypted Claude token in `claude_credentials`.
- Protect all `/api/sessions/*` endpoints with authentication and enforce owner-only access by `sessions.owner_user_id`.
- Use authenticated user's GitHub OAuth token when cloning repositories (public/private), injected via `GIT_ASKPASS` to avoid token leakage in command arguments.
- Request `read:user user:email repo read:org gist` GitHub OAuth scopes to support Session bootstrap with `gh auth`.
- Initialize GitHub authentication in each Session using `gh auth login --with-token` and `gh auth setup-git` for `github.com` over HTTPS, then rely on git credential helper integration for clone/fetch/pull/push.
- Fetch GitHub public keys for the authenticated user's login at Session creation time and apply them to Session `authorized_keys` for SSH login.
- When the GitHub token is updated, apply the new token to newly created Sessions only; existing running Sessions keep their previously initialized credentials until recreated.
- Require per-user Claude token for Claude Agent SDK execution; do not use environment-variable fallback tokens.

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
