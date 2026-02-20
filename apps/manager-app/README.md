# Manager App

Session manager UI for cloud-backed development environments.

## Required environment variables

Create `apps/manager-app/.env.local`:

```bash
MODAL_TOKEN_ID=ak-...
MODAL_TOKEN_SECRET=as-...
ANTHROPIC_API_KEY=sk-ant-...
```

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
pnpm --filter manager-app dev
```

Open `http://localhost:3000`.

## Session flow

1. Create a Session from UI.
2. Run Agent prompts from the UI (Claude Agent SDK runs inside the Session).
3. Run shell commands from the manager UI.
