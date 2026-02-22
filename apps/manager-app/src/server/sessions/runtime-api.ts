import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { hc } from "hono/client";
import { CLAUDE_TOKEN_HEADER } from "session-runtime-api/contract";
import type { SessionRuntimeAppType } from "session-runtime-api";
import {
  agentResponseSchema,
  execResponseSchema,
} from "session-runtime-api/contract";
import type {
  AgentSessionInput,
  ExecSessionInput,
  SessionExecResult,
} from "@/lib/session-types";
import { getModalClient } from "@/server/modal/client";
import { SessionError } from "@/server/sessions/errors";
import { runSessionSandboxCommand } from "@/server/sessions/sandbox-command";

const SESSION_RUNTIME_API_PORT = 8080;
const SESSION_RUNTIME_API_DIR = "/opt/session-runtime-api";
const SESSION_RUNTIME_API_DIST_DIR = `${SESSION_RUNTIME_API_DIR}/dist`;
const SESSION_RUNTIME_API_PID_PATH = "/tmp/session-runtime-api.pid";
const SESSION_RUNTIME_API_LOG_PATH = "/tmp/session-runtime-api.log";
const SESSION_RUNTIME_API_HEALTH_TIMEOUT_MS = 5_000;
const SESSION_RUNTIME_API_REQUEST_TIMEOUT_MS = 30_000;

type RuntimeApiAsset = {
  relativePath: string;
  content: Uint8Array;
};

type RuntimeApiErrorBody = {
  error?: {
    message?: string;
  };
};

function resolveRepoRoot(): string {
  const cwd = process.cwd();

  if (existsSync(path.join(cwd, "apps", "session-runtime-api"))) {
    return cwd;
  }

  if (existsSync(path.join(cwd, "..", "session-runtime-api"))) {
    return path.resolve(cwd, "..", "..");
  }

  return cwd;
}

function resolveSessionRuntimeApiDistDir(): string {
  return path.join(resolveRepoRoot(), "apps", "session-runtime-api", "dist");
}

async function walkFiles(
  rootDir: string,
  currentDir = rootDir,
): Promise<string[]> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(rootDir, entryPath)));
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }

    files.push(entryPath);
  }

  return files;
}

async function loadSessionRuntimeApiAssets(): Promise<RuntimeApiAsset[]> {
  const distDir = resolveSessionRuntimeApiDistDir();
  if (!existsSync(distDir)) {
    throw new SessionError(
      `Session runtime API build output was not found at ${distDir}. Build "session-runtime-api" before creating a Session.`,
      500,
    );
  }

  const filePaths = await walkFiles(distDir);
  if (filePaths.length === 0) {
    throw new SessionError(
      `Session runtime API build output is empty at ${distDir}.`,
      500,
    );
  }

  const assets = await Promise.all(
    filePaths.map(async (filePath) => ({
      relativePath: path.relative(distDir, filePath).split(path.sep).join("/"),
      content: new Uint8Array(await readFile(filePath)),
    })),
  );

  if (!assets.some((asset) => asset.relativePath === "server.js")) {
    throw new SessionError(
      `Session runtime API build output is missing server.js at ${distDir}.`,
      500,
    );
  }

  return assets;
}

function shellEscapeSingle(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

async function writeSandboxFile(
  providerSessionId: string,
  destinationPath: string,
  content: Uint8Array,
): Promise<void> {
  const sandbox = await getModalClient().sandboxes.fromId(providerSessionId);
  const file = await sandbox.open(destinationPath, "w");
  try {
    await file.write(content);
    await file.flush();
  } finally {
    await file.close();
  }
}

async function deploySessionRuntimeApi(
  providerSessionId: string,
): Promise<void> {
  const assets = await loadSessionRuntimeApiAssets();
  const destinationPaths = assets.map(
    (asset) => `${SESSION_RUNTIME_API_DIST_DIR}/${asset.relativePath}`,
  );
  const directories = new Set<string>([
    SESSION_RUNTIME_API_DIR,
    SESSION_RUNTIME_API_DIST_DIR,
  ]);

  for (const destinationPath of destinationPaths) {
    directories.add(path.posix.dirname(destinationPath));
  }

  const mkdirCommand = `mkdir -p ${[...directories]
    .map(shellEscapeSingle)
    .join(" ")}`;
  const mkdirResult = await runSessionSandboxCommand(providerSessionId, [
    "sh",
    "-lc",
    mkdirCommand,
  ]);
  if (mkdirResult.exitCode !== 0) {
    throw new SessionError(
      mkdirResult.stderr || mkdirResult.stdout || "Failed to prepare runtime API directory",
      500,
    );
  }

  for (const asset of assets) {
    await writeSandboxFile(
      providerSessionId,
      `${SESSION_RUNTIME_API_DIST_DIR}/${asset.relativePath}`,
      asset.content,
    );
  }
}

async function startSessionRuntimeApiProcess(
  providerSessionId: string,
  options?: { forceRestart?: boolean },
): Promise<void> {
  const forceRestart = options?.forceRestart ?? false;
  const startScript = `
set -eu
mkdir -p ${shellEscapeSingle(SESSION_RUNTIME_API_DIR)}
if [ ${forceRestart ? "1" : "0"} -eq 1 ] && [ -s ${shellEscapeSingle(SESSION_RUNTIME_API_PID_PATH)} ]; then
  pid="$(cat ${shellEscapeSingle(SESSION_RUNTIME_API_PID_PATH)} 2>/dev/null || true)"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" || true
    sleep 0.2
  fi
  rm -f ${shellEscapeSingle(SESSION_RUNTIME_API_PID_PATH)}
fi
if [ -s ${shellEscapeSingle(SESSION_RUNTIME_API_PID_PATH)} ]; then
  pid="$(cat ${shellEscapeSingle(SESSION_RUNTIME_API_PID_PATH)} 2>/dev/null || true)"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    exit 0
  fi
  rm -f ${shellEscapeSingle(SESSION_RUNTIME_API_PID_PATH)}
fi
cd ${shellEscapeSingle(SESSION_RUNTIME_API_DIR)}
nohup env PORT=${SESSION_RUNTIME_API_PORT} node ${shellEscapeSingle(`${SESSION_RUNTIME_API_DIST_DIR}/server.js`)} >>${shellEscapeSingle(SESSION_RUNTIME_API_LOG_PATH)} 2>&1 &
echo $! > ${shellEscapeSingle(SESSION_RUNTIME_API_PID_PATH)}
`;

  const result = await runSessionSandboxCommand(providerSessionId, [
    "sh",
    "-lc",
    startScript,
  ]);
  if (result.exitCode !== 0) {
    throw new SessionError(
      result.stderr || result.stdout || "Failed to start session runtime API",
      500,
    );
  }
}

function withTimeout(
  timeoutMs: number,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeout),
  };
}

async function createSessionRuntimeRpcClient(
  providerSessionId: string,
): Promise<{
  client: ReturnType<typeof hc<SessionRuntimeAppType>>;
}> {
  const sandbox = await getModalClient().sandboxes.fromId(providerSessionId);
  const connect = await sandbox.createConnectToken();
  const baseUrl = connect.url.endsWith("/") ? connect.url : `${connect.url}/`;
  const client = hc<SessionRuntimeAppType>(baseUrl, {
    headers: {
      Authorization: `Bearer ${connect.token}`,
    },
  });

  return { client };
}

async function fetchSessionRuntimeApi(
  providerSessionId: string,
  pathname: string,
  init?: RequestInit,
  timeoutMs = SESSION_RUNTIME_API_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const sandbox = await getModalClient().sandboxes.fromId(providerSessionId);
  const connect = await sandbox.createConnectToken();
  const baseUrl = connect.url.endsWith("/") ? connect.url : `${connect.url}/`;
  const url = new URL(pathname.replace(/^\//, ""), baseUrl);
  const timeout = withTimeout(timeoutMs);
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${connect.token}`);

  try {
    return await fetch(url, {
      ...init,
      headers,
      signal: timeout.signal,
    });
  } finally {
    timeout.cleanup();
  }
}

async function checkSessionRuntimeApiHealth(
  providerSessionId: string,
): Promise<boolean> {
  try {
    const response = await fetchSessionRuntimeApi(
      providerSessionId,
      "/healthz",
      undefined,
      SESSION_RUNTIME_API_HEALTH_TIMEOUT_MS,
    );
    return response.ok;
  } catch {
    return false;
  }
}

export async function ensureSessionRuntimeApiReady(
  providerSessionId: string,
  options?: { deployIfNeeded?: boolean; forceRestart?: boolean },
): Promise<void> {
  if (!options?.forceRestart && (await checkSessionRuntimeApiHealth(providerSessionId))) {
    return;
  }

  if (options?.deployIfNeeded ?? true) {
    await deploySessionRuntimeApi(providerSessionId);
  }

  await startSessionRuntimeApiProcess(providerSessionId, {
    forceRestart: options?.forceRestart,
  });

  const healthStart = Date.now();
  while (Date.now() - healthStart < SESSION_RUNTIME_API_HEALTH_TIMEOUT_MS) {
    if (await checkSessionRuntimeApiHealth(providerSessionId)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const logResult = await runSessionSandboxCommand(providerSessionId, [
    "sh",
    "-lc",
    `tail -n 120 ${shellEscapeSingle(SESSION_RUNTIME_API_LOG_PATH)} 2>/dev/null || true`,
  ]);

  throw new SessionError(
    `Session runtime API did not become healthy.${logResult.stdout ? ` Logs:\n${logResult.stdout}` : ""}`,
    500,
  );
}

function toJsonLines(values: unknown[]): string {
  if (values.length === 0) {
    return "";
  }

  return `${values.map((value) => JSON.stringify(value)).join("\n")}\n`;
}

async function parseRuntimeApiError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as RuntimeApiErrorBody | null;
  return body?.error?.message ?? `Runtime API request failed (${response.status})`;
}

export async function callSessionRuntimeExec(
  providerSessionId: string,
  input: ExecSessionInput,
): Promise<SessionExecResult> {
  await ensureSessionRuntimeApiReady(providerSessionId, { deployIfNeeded: true });
  const { client } = await createSessionRuntimeRpcClient(providerSessionId);
  const timeout = withTimeout(SESSION_RUNTIME_API_REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await client.rpc.exec.$post(
      {
        json: {
          cmd: input.cmd,
          cwd: input.cwd,
          pty: input.pty,
        },
      },
      {
        init: {
          signal: timeout.signal,
        },
      },
    );
  } catch (error) {
    throw new SessionError(
      error instanceof Error
        ? `Session runtime API exec request failed before a safe response was received: ${error.message}`
        : "Session runtime API exec request failed before a safe response was received",
      502,
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw new SessionError(await parseRuntimeApiError(response), response.status);
  }

  const body = execResponseSchema.parse(await response.json());
  return body.result;
}

export async function callSessionRuntimeAgent(
  providerSessionId: string,
  input: AgentSessionInput,
  claudeToken: string,
  timeoutMs: number,
): Promise<SessionExecResult> {
  await ensureSessionRuntimeApiReady(providerSessionId, { deployIfNeeded: true });
  const { client } = await createSessionRuntimeRpcClient(providerSessionId);
  const timeout = withTimeout(timeoutMs);
  let response: Response;
  try {
    response = await client.rpc.agent.$post(
      {
        json: {
          prompt: input.prompt,
          cwd: input.cwd,
          maxTurns: input.maxTurns,
        },
      },
      {
        headers: {
          [CLAUDE_TOKEN_HEADER]: claudeToken,
        },
        init: {
          signal: timeout.signal,
        },
      },
    );
  } catch (error) {
    throw new SessionError(
      error instanceof Error
        ? `Session runtime API agent request failed before a safe response was received: ${error.message}`
        : "Session runtime API agent request failed before a safe response was received",
      502,
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw new SessionError(await parseRuntimeApiError(response), response.status);
  }

  const body = agentResponseSchema.parse(await response.json());
  return {
    stdout: toJsonLines(body.events),
    stderr: "",
    exitCode: 0,
  };
}
