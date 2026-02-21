# Manager App

Session manager UI for cloud-backed development environments.

## Required environment variables

Create `apps/manager-app/.env.local`:

```bash
MODAL_TOKEN_ID=ak-...
MODAL_TOKEN_SECRET=as-...
AUTH_JWT_SECRET=replace-with-long-random-secret-at-least-32-chars
TOKEN_ENCRYPTION_KEY=<base64-encoded-32-byte-key>
GITHUB_CLIENT_ID=Iv1...
GITHUB_CLIENT_SECRET=...
GITHUB_OAUTH_CALLBACK_URL=http://localhost:3000/api/auth/github/callback
SESSION_USER_AUTH_TOKEN=your-claude-setup-token
```

- `TOKEN_ENCRYPTION_KEY` must be base64 encoded 32-byte key.
- `GITHUB_OAUTH_CALLBACK_URL` must match your GitHub OAuth App settings.
- `SESSION_USER_AUTH_TOKEN` is still used for Claude Agent SDK execution.

Generate secrets locally:

```bash
node -e 'console.log(require(\"node:crypto\").randomBytes(32).toString(\"base64\"))'
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
# (Important) remove old session rows before applying migration that adds owner_user_id.
# sqlite3 apps/manager-app/data/manager.db "delete from sessions;"
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

1. Sign in with GitHub from UI.
2. Create a Session from UI (public/private GitHub repositories supported with your OAuth token).
3. Session bootstrap enables SSH login with your GitHub-registered public keys.
4. Run Agent prompts from the UI (Claude Agent SDK runs inside the Session with the setup-token).
5. Run shell commands from the manager UI.

## Auth flow

1. `GET /api/auth/github/login` redirects to GitHub OAuth authorize endpoint with `state` + PKCE.
2. `GET /api/auth/github/callback` exchanges code, stores/upserts user + GitHub data, and sets JWT cookie.
3. `GET /api/me` resolves current user from JWT cookie.
4. `POST /api/auth/logout` clears JWT cookie.

## Data model

- `users`: app-level user identity.
- `github_accounts`: GitHub profile linked 1:1 to `users`.
- `github_credentials`: encrypted GitHub OAuth credentials linked 1:1 to `github_accounts`.
- `sessions.owner_user_id`: owner isolation for all Session operations.
