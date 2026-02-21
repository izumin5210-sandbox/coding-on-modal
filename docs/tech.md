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
- In the future, enable the same agent execution foundation to be called from non-Web channels (for example, Slack).
- In the future, provide SSH access to sessions to allow direct CLI-based execution.

## Authentication Strategy (Current Phase)
- The initial phase assumes a single fixed user.
- Inject Claude credentials through environment variables using a token obtained by `claude setup-token`.
- Resolution priority: `SESSION_USER_AUTH_TOKEN`, then compatibility fallbacks `ANTHROPIC_AUTH_TOKEN` / `CLAUDE_CODE_OAUTH_TOKEN`.

## API & Naming Rules
- Standardize public naming on `Session` and use `/sessions` route semantics.
- Avoid exposing Modal-specific concepts excessively in UI/API.
- Acquire `db` in API handlers and pass it into service/store layers via dependency injection.

## Operational Constraints
- Fail fast with explicit errors when required environment variables are missing.
- Implement session operations (`terminate`/`delete`) with idempotency in mind.
- Control global/idle timeout values through environment variables.

## Near-Term Technical Priorities
- When user authentication is introduced, separate token handling per user.
- Add retention policy for audit logs and execution history.
- Decouple agent execution APIs from chat input channels to support channel expansion.
- Define authorization and audit-log design for SSH-based operations.
- Define migration automation strategy for deployment environments.
