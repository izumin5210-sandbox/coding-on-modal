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
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
REDIS_URL=redis://localhost:6379
```

- `TOKEN_ENCRYPTION_KEY` must be base64 encoded 32-byte key.
- `GITHUB_OAUTH_CALLBACK_URL` must match your GitHub OAuth App settings.
- Claude API key is configured per user from the UI modal and stored encrypted in DB.
- `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET` come from your Slack app configuration.
- `REDIS_URL` is used by Chat SDK for Slack thread subscription state management.

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
SLACK_LINK_BASE_URL=https://your-app.example.com
```

Session image includes `git`, `gh`, `curl`, `openssh-server`, `sudo`, and Claude Code CLI (`claude`) pinned to `2.1.29` (auto-update disabled).

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
2. Create a Session from UI. If Claude API key is not configured yet, the app opens a modal and asks you to save it first.
3. Session creation resumes automatically after API key save (public/private GitHub repositories supported with your OAuth token).
4. Session bootstrap enables SSH login with your GitHub-registered public keys.
5. The SSH user is granted passwordless `sudo` inside the Session.
6. If Claude API key is configured, Session shell startup exports `ANTHROPIC_API_KEY` for the SSH user.
7. Run Agent prompts from the UI (Claude Agent SDK runs inside the Session with your saved API key).
8. Run shell commands from the manager UI.

## Auth flow

1. `GET /api/auth/github/login` redirects to GitHub OAuth authorize endpoint with `state` + PKCE.
2. `GET /api/auth/github/callback` exchanges code, stores/upserts user + GitHub data, and sets JWT cookie.
3. `GET /api/me` resolves current user from JWT cookie.
4. `POST /api/auth/logout` clears JWT cookie.

## Data model

- `users`: app-level user identity.
- `github_accounts`: GitHub profile linked 1:1 to `users`.
- `github_credentials`: encrypted GitHub OAuth credentials linked 1:1 to `github_accounts`.
- `claude_credentials`: encrypted Claude API key linked 1:1 to `users`.
- `sessions.owner_user_id`: owner isolation for all Session operations.
- `slack_thread_sessions`: maps Slack thread (team + channel + thread_ts) to a Session.
- `slack_user_mappings`: maps Slack user to app user (linked via one-time URL).
- `slack_link_tokens`: one-time tokens for the Slack user linking flow.

## Slack integration

Mentioning the bot in a Slack channel creates a new Session and starts an agent run. All subsequent messages in that Slack thread are routed to the same Session.

1. Set up a Slack app with Bot Token Scopes: `app_mentions:read`, `channels:history`, `groups:history`, `chat:write`, `im:write`.
2. Enable Event Subscriptions and point the Request URL to `https://<host>/api/webhooks/slack`.
3. Subscribe to bot events: `app_mention`, `message.channels`, `message.groups`, `message.im`.
4. Enable Interactivity and point the Request URL to `https://<host>/api/webhooks/slack`.
5. Set `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, and `REDIS_URL` in your environment.
6. Run `pnpm --filter manager-app db:migrate` to apply the Slack tables migration.

Users link their Slack account to their app account via a one-time URL sent as an ephemeral message on first mention.
