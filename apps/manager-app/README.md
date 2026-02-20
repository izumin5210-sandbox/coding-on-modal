# Manager App

Session manager UI for cloud-backed development environments.

## Required environment variables

Create `apps/manager-app/.env.local`:

```bash
MODAL_TOKEN_ID=ak-...
MODAL_TOKEN_SECRET=as-...
SESSION_USER_AUTH_TOKEN=your-claude-setup-token
```

`SESSION_USER_AUTH_TOKEN` is the single-user token for now.  
Generate it with `claude setup-token` on the user account that owns the Claude subscription.

Optional:

```bash
MODAL_ENVIRONMENT=main
MODAL_APP_NAME=coding-on-modal-session-manager
DEFAULT_REPO_URL=https://github.com/izumin5210-sandbox/coding-on-modal
DEFAULT_REPO_REF=main
SANDBOX_TIMEOUT_MINUTES=60
SANDBOX_IDLE_TIMEOUT_MINUTES=30
AGENT_MAX_TURNS=8
SESSION_DB_PATH=apps/manager-app/data/manager.db
```

## Run

```bash
pnpm --filter manager-app db:migrate
pnpm --filter manager-app dev
```

Open `http://localhost:3000`.

## Database workflow

- ORM: Drizzle ORM v1 beta (`drizzle-orm` + `drizzle-kit`).
- Runtime: API handlers acquire DB and inject it into service/store layers.
- Schema change flow:
  1. Update `src/server/db/schema.ts`.
  2. Run `pnpm --filter manager-app db:generate`.
  3. Run `pnpm --filter manager-app db:migrate`.

## Session flow

1. Create a Session from UI.
2. Run Agent prompts from the UI (Claude Agent SDK runs inside the Session with the setup-token).
3. Run shell commands from the manager UI.
