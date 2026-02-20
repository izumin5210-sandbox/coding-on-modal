import { randomUUID } from "node:crypto";
import { NotFoundError } from "modal";
import type {
  CreateSessionInput,
  ExecSessionInput,
  SessionExecResult,
  SessionRecord,
  SessionStatus,
} from "@/lib/session-types";
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

const WORKSPACE_PATH = "/workspace/repo";

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

function toPublic(record: SessionStoreRecord): SessionRecord {
  return {
    id: record.id,
    name: record.name,
    repoUrl: record.repoUrl,
    repoRef: record.repoRef,
    status: record.status,
    workspacePath: record.workspacePath,
    terminalUrl: record.terminalUrl,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastError: record.lastError,
  };
}

function notFound(id: string): SessionError {
  return new SessionError(`Session not found: ${id}`, 404);
}

async function refreshStatus(
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
        updateSession(record.id, {
          status: nextStatus,
        }) ?? record
      );
    }

    return record;
  } catch (error) {
    if (error instanceof NotFoundError) {
      return (
        updateSession(record.id, {
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
  params?: { cwd?: string; pty?: boolean },
): Promise<SessionExecResult> {
  const providerSession =
    await getModalClient().sandboxes.fromId(providerSessionId);
  const process = await providerSession.exec(command, {
    stdout: "pipe",
    stderr: "pipe",
    workdir: params?.cwd,
    pty: params?.pty,
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

async function mustGetSession(id: string): Promise<SessionStoreRecord> {
  const record = getSession(id);
  if (!record) {
    throw notFound(id);
  }

  return refreshStatus(record);
}

export async function createSession(
  input: CreateSessionInput,
): Promise<SessionRecord> {
  const env = getEnv();
  const name =
    input.name?.trim() ||
    `session-${new Date().toISOString().slice(0, 10)}-${Math.floor(Math.random() * 10_000)}`;
  const repoUrl = input.repoUrl?.trim() || env.DEFAULT_REPO_URL;
  const repoRef = input.repoRef?.trim() || env.DEFAULT_REPO_REF;

  const modal = getModalClient();
  const [app, image] = await Promise.all([getModalApp(), getSessionImage()]);
  const providerSession = await modal.sandboxes.create(app, image, {
    name,
    timeoutMs: env.SANDBOX_TIMEOUT_MINUTES * 60_000,
    idleTimeoutMs: env.SANDBOX_IDLE_TIMEOUT_MINUTES * 60_000,
    encryptedPorts: [env.SANDBOX_TTYD_PORT],
  });

  let status: SessionStatus = "running";
  let lastError: string | undefined;

  try {
    const cloneResult = await runCommand(providerSession.sandboxId, [
      "git",
      "clone",
      "--depth",
      "1",
      "--branch",
      repoRef,
      repoUrl,
      WORKSPACE_PATH,
    ]);

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
    providerSessionId: providerSession.sandboxId,
    name,
    repoUrl,
    repoRef,
    status,
    workspacePath: WORKSPACE_PATH,
    terminalUrl: undefined,
    createdAt: now,
    updatedAt: now,
    lastError,
  };

  insertSession(record);
  return toPublic(record);
}

export async function listSessionRecords(): Promise<SessionRecord[]> {
  return listSessions().map(toPublic);
}

export async function getSessionRecord(id: string): Promise<SessionRecord> {
  const record = await mustGetSession(id);
  return toPublic(record);
}

export async function terminateSessionRecord(
  id: string,
): Promise<SessionRecord> {
  const record = await mustGetSession(id);

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
    updateSession(id, {
      status: "terminated",
    }) ?? record;

  return toPublic(updated);
}

export async function deleteSessionRecord(id: string): Promise<boolean> {
  return deleteSession(id);
}

export async function openSessionTerminal(id: string): Promise<SessionRecord> {
  const env = getEnv();
  const record = await mustGetSession(id);
  if (record.status === "terminated") {
    throw new SessionError("Session is already terminated", 409);
  }

  const providerSession = await getModalClient().sandboxes.fromId(
    record.providerSessionId,
  );
  const startupCommand = [
    "sh",
    "-lc",
    `if ! pgrep -x ttyd >/dev/null 2>&1; then nohup ttyd -W -p ${env.SANDBOX_TTYD_PORT} bash >/tmp/ttyd.log 2>&1 & fi`,
  ];

  const startupResult = await runCommand(
    providerSession.sandboxId,
    startupCommand,
  );
  if (startupResult.exitCode !== 0) {
    throw new SessionError(
      startupResult.stderr || "Failed to start terminal",
      500,
    );
  }

  const tunnels = await providerSession.tunnels(20_000);
  const tunnel = tunnels[env.SANDBOX_TTYD_PORT];
  if (!tunnel?.url) {
    throw new SessionError("Failed to expose terminal tunnel", 500);
  }

  const updated =
    updateSession(id, {
      terminalUrl: tunnel.url,
      status: "running",
    }) ?? record;

  return toPublic(updated);
}

export async function executeInSession(
  id: string,
  input: ExecSessionInput,
): Promise<SessionExecResult> {
  const record = await mustGetSession(id);
  if (record.status === "terminated") {
    throw new SessionError("Session is terminated", 409);
  }

  const command = input.cmd.trim();
  if (!command) {
    throw new SessionError("cmd must not be empty", 400);
  }

  try {
    return await runCommand(record.providerSessionId, ["sh", "-lc", command], {
      cwd: input.cwd?.trim() || record.workspacePath,
      pty: input.pty ?? true,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      updateSession(id, { status: "terminated" });
      throw new SessionError("Session no longer exists", 409);
    }

    throw error;
  }
}
