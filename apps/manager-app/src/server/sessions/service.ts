import { randomUUID } from "node:crypto";
import { NotFoundError, type Secret } from "modal";
import type {
  AgentSessionInput,
  CreateSessionInput,
  ExecSessionInput,
  SessionExecResult,
  SessionRecord,
  SessionSshInfo,
  SessionStatus,
} from "@/lib/session-types";
import { decryptToken } from "@/server/crypto/token";
import type { AppDb } from "@/server/db";
import { getEnv } from "@/server/env";
import { getModalApp, getModalClient } from "@/server/modal/client";
import { getSessionImage } from "@/server/modal/image";
import {
  deleteSession,
  getSession,
  insertSession,
  listSessions,
  type SessionStoreRecord,
  updateSession,
} from "@/server/sessions/store";
import {
  getAuthUserById,
  getEncryptedGithubAccessTokenByUserId,
} from "@/server/users/store";

const WORKSPACE_PATH = "/workspace/repo";
const AGENT_SDK_WORKDIR = "/opt/agent-sdk";
const SESSION_SSH_PORT = 22;
const SESSION_SSH_TUNNELS_TIMEOUT_MS = 10_000;
const LINUX_USERNAME_PATTERN = /^[a-z_][a-z0-9_-]{0,31}$/;
const AGENT_RUNNER_SOURCE = `
import { query } from "@anthropic-ai/claude-agent-sdk";

const prompt = process.env.AGENT_PROMPT ?? "";
const cwd = process.env.AGENT_CWD ?? process.cwd();
const maxTurns = Number(process.env.AGENT_MAX_TURNS ?? "8");

if (!prompt.trim()) {
  console.error("AGENT_PROMPT is empty");
  process.exit(2);
}

const options = {
  cwd,
  maxTurns,
  permissionMode: "bypassPermissions",
  allowDangerouslySkipPermissions: true,
};

for await (const message of query({ prompt, options })) {
  process.stdout.write(JSON.stringify(message) + "\\n");
}
`;

function resolveSingleUserAuthToken(
  env: ReturnType<typeof getEnv>,
): string | null {
  return (
    env.SESSION_USER_AUTH_TOKEN ??
    env.ANTHROPIC_AUTH_TOKEN ??
    env.CLAUDE_CODE_OAUTH_TOKEN ??
    null
  );
}

export class SessionError extends Error {
  constructor(
    message: string,
    readonly statusCode = 500,
  ) {
    super(message);
  }
}

function createSessionId(): string {
  return `sess_${randomUUID().replaceAll("-", "")}`;
}

function isValidLinuxUsername(value: string): boolean {
  return LINUX_USERNAME_PATTERN.test(value);
}

function resolveSessionSshUser(githubLogin: string): string {
  const normalized = githubLogin.trim();
  if (!isValidLinuxUsername(normalized)) {
    throw new SessionError(
      `GitHub login "${githubLogin}" cannot be used as Session SSH user. Login must match ${LINUX_USERNAME_PATTERN.source}.`,
      400,
    );
  }

  return normalized;
}

function toPublic(
  record: SessionStoreRecord,
  options?: { ssh?: SessionSshInfo | null },
): SessionRecord {
  const base: SessionRecord = {
    id: record.id,
    name: record.name,
    repoUrl: record.repoUrl,
    repoRef: record.repoRef,
    status: record.status,
    workspacePath: record.workspacePath,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastError: record.lastError,
  };

  if (options && "ssh" in options) {
    base.ssh = options.ssh ?? null;
  }

  return base;
}

function notFound(id: string): SessionError {
  return new SessionError(`Session not found: ${id}`, 404);
}

async function refreshStatus(
  db: AppDb,
  record: SessionStoreRecord,
): Promise<SessionStoreRecord> {
  const modal = getModalClient();

  try {
    const providerSession = await modal.sandboxes.fromId(
      record.providerSessionId,
    );
    const exitCode = await providerSession.poll();

    const nextStatus: SessionStatus =
      exitCode === null
        ? record.status === "error"
          ? "error"
          : "running"
        : "terminated";

    if (nextStatus !== record.status) {
      return (
        updateSession(db, record.ownerUserId, record.id, {
          status: nextStatus,
        }) ?? record
      );
    }

    return record;
  } catch (error) {
    if (error instanceof NotFoundError) {
      return (
        updateSession(db, record.ownerUserId, record.id, {
          status: "terminated",
          lastError: record.lastError,
        }) ?? record
      );
    }

    throw error;
  }
}

async function runCommand(
  providerSessionId: string,
  command: string[],
  params?: {
    workdir?: string;
    pty?: boolean;
    timeoutMs?: number;
    env?: Record<string, string>;
    secrets?: Secret[];
  },
): Promise<SessionExecResult> {
  const providerSession =
    await getModalClient().sandboxes.fromId(providerSessionId);
  const process = await providerSession.exec(command, {
    stdout: "pipe",
    stderr: "pipe",
    workdir: params?.workdir,
    pty: params?.pty,
    timeoutMs: params?.timeoutMs,
    env: params?.env,
    secrets: params?.secrets,
  });

  const [exitCode, stdout, stderr] = await Promise.all([
    process.wait(),
    process.stdout.readText(),
    process.stderr.readText(),
  ]);

  return {
    stdout,
    stderr,
    exitCode,
  };
}

async function resolveHostKeyMetadata(providerSessionId: string): Promise<{
  fingerprint: string;
  keyType: string;
  key: string;
} | null> {
  const result = await runCommand(
    providerSessionId,
    [
      "sh",
      "-lc",
      `
set -eu
for key_path in /etc/ssh/ssh_host_ed25519_key.pub /etc/ssh/ssh_host_ecdsa_key.pub /etc/ssh/ssh_host_rsa_key.pub; do
  if [ -f "$key_path" ]; then
    fingerprint="$(ssh-keygen -lf "$key_path" | awk '{print $2}')"
    key_line="$(cat "$key_path")"
    printf '%s\n' "$fingerprint"
    printf '%s\n' "$key_line"
    exit 0
  fi
done
echo "SSH host public key is missing." >&2
exit 1
      `,
    ],
    {
      pty: false,
    },
  );

  if (result.exitCode !== 0) {
    return null;
  }

  const [fingerprintLine = "", keyLine = ""] = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const [keyType = "", key = ""] = keyLine.split(/\s+/);

  if (!fingerprintLine || !keyType || !key) {
    return null;
  }

  return {
    fingerprint: fingerprintLine,
    keyType,
    key,
  };
}

async function resolveSessionSshInfo(
  record: SessionStoreRecord,
  sshUser: string,
): Promise<SessionSshInfo | null> {
  if (record.status !== "running") {
    return null;
  }

  try {
    const providerSession = await getModalClient().sandboxes.fromId(
      record.providerSessionId,
    );
    const tunnels = await providerSession.tunnels(
      SESSION_SSH_TUNNELS_TIMEOUT_MS,
    );
    const sshTunnel = tunnels[SESSION_SSH_PORT];
    if (!sshTunnel) {
      return null;
    }

    const [host, port] = sshTunnel.tcpSocket;
    const hostKey = await resolveHostKeyMetadata(record.providerSessionId);
    if (!hostKey) {
      return null;
    }

    return {
      user: sshUser,
      host,
      port,
      hostKeyFingerprint: hostKey.fingerprint,
      knownHostsEntry: `[${host}]:${port} ${hostKey.keyType} ${hostKey.key}`,
      command: `ssh -p ${port} ${sshUser}@${host}`,
    };
  } catch {
    return null;
  }
}

async function mustGetSession(
  db: AppDb,
  ownerUserId: string,
  id: string,
): Promise<SessionStoreRecord> {
  const record = getSession(db, ownerUserId, id);
  if (!record) {
    throw notFound(id);
  }

  return refreshStatus(db, record);
}

export async function createSession(
  db: AppDb,
  ownerUserId: string,
  input: CreateSessionInput,
): Promise<SessionRecord> {
  const env = getEnv();
  const name =
    input.name?.trim() ||
    `session-${new Date().toISOString().slice(0, 10)}-${Math.floor(Math.random() * 10_000)}`;
  const repoUrl = input.repoUrl?.trim() || env.DEFAULT_REPO_URL;
  const repoRef = input.repoRef?.trim() || env.DEFAULT_REPO_REF;
  const authUser = getAuthUserById(db, ownerUserId);
  if (!authUser) {
    throw new SessionError("Authentication required", 401);
  }
  const sshUser = resolveSessionSshUser(authUser.github.login);
  const encryptedGithubToken = getEncryptedGithubAccessTokenByUserId(
    db,
    ownerUserId,
  );
  if (!encryptedGithubToken) {
    throw new SessionError(
      "GitHub credential was not found. Please log in with GitHub again.",
      401,
    );
  }
  const githubToken = decryptToken(encryptedGithubToken);

  const modal = getModalClient();
  const [app, image] = await Promise.all([getModalApp(), getSessionImage()]);
  const providerSession = await modal.sandboxes.create(app, image, {
    name,
    timeoutMs: env.SANDBOX_TIMEOUT_MINUTES * 60_000,
    idleTimeoutMs: env.SANDBOX_IDLE_TIMEOUT_MINUTES * 60_000,
    unencryptedPorts: [SESSION_SSH_PORT],
  });

  let status: SessionStatus = "running";
  let lastError: string | undefined;

  try {
    const githubAuthSecret = await modal.secrets.fromObject({
      SESSION_GITHUB_TOKEN: githubToken,
    });
    const cloneResult = await runCommand(
      providerSession.sandboxId,
      [
        "sh",
        "-lc",
        `
set -eu
printf '%s\n' "$SESSION_GITHUB_TOKEN" | env -u GH_TOKEN -u GITHUB_TOKEN gh auth login --hostname github.com --git-protocol https --with-token
env -u GH_TOKEN -u GITHUB_TOKEN gh auth setup-git --hostname github.com
if ! id -u "$SSH_USER" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "$SSH_USER"
fi
home_dir="$(getent passwd "$SSH_USER" | cut -d: -f6)"
if [ -z "$home_dir" ]; then
  echo "Failed to resolve SSH user home directory: $SSH_USER" >&2
  exit 1
fi
install -d -m 700 -o "$SSH_USER" -g "$SSH_USER" "$home_dir/.ssh"
gh api --hostname github.com "/users/$GITHUB_LOGIN/keys" --jq '.[].key' > "$home_dir/.ssh/authorized_keys"
if [ ! -s "$home_dir/.ssh/authorized_keys" ]; then
  echo "No SSH public keys found for GitHub login: $GITHUB_LOGIN" >&2
  exit 1
fi
chmod 600 "$home_dir/.ssh/authorized_keys"
chown "$SSH_USER:$SSH_USER" "$home_dir/.ssh/authorized_keys"
install -d -m 755 /run/sshd
ssh-keygen -A
/usr/sbin/sshd -t
/usr/sbin/sshd -E /tmp/sshd.log
started=0
for _ in 1 2 3 4 5 6 7 8 9 10; do
  for pid_file in /run/sshd.pid /var/run/sshd.pid; do
    if [ -s "$pid_file" ]; then
      sshd_pid="$(cat "$pid_file" 2>/dev/null || true)"
      if [ -n "$sshd_pid" ] && kill -0 "$sshd_pid" 2>/dev/null; then
        started=1
        break 2
      fi
    fi
  done
  sleep 0.1
done
if [ "$started" -ne 1 ]; then
  echo "sshd did not start correctly." >&2
  cat /tmp/sshd.log >&2 || true
  exit 1
fi
GIT_TERMINAL_PROMPT=0 git clone --depth 1 --branch "$REPO_REF" "$REPO_URL" "$WORKSPACE_PATH"
        `,
      ],
      {
        env: {
          REPO_URL: repoUrl,
          REPO_REF: repoRef,
          WORKSPACE_PATH,
          GITHUB_LOGIN: authUser.github.login,
          SSH_USER: sshUser,
        },
        secrets: [githubAuthSecret],
      },
    );

    if (cloneResult.exitCode !== 0) {
      status = "error";
      lastError =
        cloneResult.stderr ||
        cloneResult.stdout ||
        "Failed to clone repository";
    }
  } catch (error) {
    status = "error";
    lastError = error instanceof Error ? error.message : String(error);
  }

  const now = new Date().toISOString();
  const record: SessionStoreRecord = {
    id: createSessionId(),
    ownerUserId,
    providerSessionId: providerSession.sandboxId,
    name,
    repoUrl,
    repoRef,
    status,
    workspacePath: WORKSPACE_PATH,
    createdAt: now,
    updatedAt: now,
    lastError,
  };

  insertSession(db, record);
  return toPublic(record);
}

export async function listSessionRecords(
  db: AppDb,
  ownerUserId: string,
): Promise<SessionRecord[]> {
  return listSessions(db, ownerUserId).map((record) => toPublic(record));
}

export async function getSessionRecord(
  db: AppDb,
  ownerUserId: string,
  id: string,
): Promise<SessionRecord> {
  const record = await mustGetSession(db, ownerUserId, id);
  const authUser = getAuthUserById(db, ownerUserId);
  if (!authUser) {
    return toPublic(record, { ssh: null });
  }

  const sshUser = authUser.github.login.trim();
  if (!isValidLinuxUsername(sshUser)) {
    return toPublic(record, { ssh: null });
  }

  const ssh = await resolveSessionSshInfo(record, sshUser);
  return toPublic(record, { ssh });
}

export async function terminateSessionRecord(
  db: AppDb,
  ownerUserId: string,
  id: string,
): Promise<SessionRecord> {
  const record = await mustGetSession(db, ownerUserId, id);

  try {
    const providerSession = await getModalClient().sandboxes.fromId(
      record.providerSessionId,
    );
    await providerSession.terminate();
  } catch (error) {
    if (!(error instanceof NotFoundError)) {
      throw error;
    }
  }

  const updated =
    updateSession(db, ownerUserId, id, {
      status: "terminated",
    }) ?? record;

  return toPublic(updated);
}

export async function deleteSessionRecord(
  db: AppDb,
  ownerUserId: string,
  id: string,
): Promise<boolean> {
  return deleteSession(db, ownerUserId, id);
}

export async function executeInSession(
  db: AppDb,
  ownerUserId: string,
  id: string,
  input: ExecSessionInput,
): Promise<SessionExecResult> {
  const record = await mustGetSession(db, ownerUserId, id);
  if (record.status === "terminated") {
    throw new SessionError("Session is terminated", 409);
  }

  const command = input.cmd.trim();
  if (!command) {
    throw new SessionError("cmd must not be empty", 400);
  }

  try {
    return await runCommand(record.providerSessionId, ["sh", "-lc", command], {
      workdir: input.cwd?.trim() || record.workspacePath,
      pty: input.pty ?? true,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      updateSession(db, ownerUserId, id, { status: "terminated" });
      throw new SessionError("Session no longer exists", 409);
    }

    throw error;
  }
}

export async function runAgentInSession(
  db: AppDb,
  ownerUserId: string,
  id: string,
  input: AgentSessionInput,
): Promise<SessionExecResult> {
  const env = getEnv();
  const authToken = resolveSingleUserAuthToken(env);
  if (!authToken) {
    throw new SessionError(
      "SESSION_USER_AUTH_TOKEN (or ANTHROPIC_AUTH_TOKEN / CLAUDE_CODE_OAUTH_TOKEN) is required",
      400,
    );
  }

  const record = await mustGetSession(db, ownerUserId, id);
  if (record.status === "terminated") {
    throw new SessionError("Session is terminated", 409);
  }

  const prompt = input.prompt.trim();
  if (!prompt) {
    throw new SessionError("prompt must not be empty", 400);
  }

  const maxTurns = Math.min(
    20,
    Math.max(1, input.maxTurns ?? env.AGENT_MAX_TURNS),
  );
  const secret = await getModalClient().secrets.fromObject({
    ANTHROPIC_AUTH_TOKEN: authToken,
    CLAUDE_CODE_OAUTH_TOKEN: authToken,
  });

  try {
    return await runCommand(
      record.providerSessionId,
      ["node", "--input-type=module", "-e", AGENT_RUNNER_SOURCE],
      {
        workdir: AGENT_SDK_WORKDIR,
        pty: false,
        timeoutMs: env.SANDBOX_TIMEOUT_MINUTES * 60_000,
        env: {
          AGENT_PROMPT: prompt,
          AGENT_CWD: input.cwd?.trim() || record.workspacePath,
          AGENT_MAX_TURNS: String(maxTurns),
        },
        secrets: [secret],
      },
    );
  } catch (error) {
    if (error instanceof NotFoundError) {
      updateSession(db, ownerUserId, id, { status: "terminated" });
      throw new SessionError("Session no longer exists", 409);
    }

    throw error;
  }
}
