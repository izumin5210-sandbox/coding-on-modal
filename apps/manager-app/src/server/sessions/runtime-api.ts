import { randomUUID } from "node:crypto";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Options, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type {
  AgentSessionInput,
  ExecSessionInput,
  SessionExecResult,
} from "@/lib/session-types";
import { getModalClient } from "@/server/modal/client";
import { ModalExecSpawnedProcessAdapter } from "@/server/sessions/claude-spawn-adapter";
import { SessionError } from "@/server/sessions/errors";
import { runSessionSandboxCommand } from "@/server/sessions/sandbox-command";

const SESSION_RUNTIME_API_REQUEST_TIMEOUT_MS = 30_000;
const CLAUDE_CODE_PATH_IN_SESSION = "/usr/local/bin/claude";
const STDERR_TAIL_MAX_CHARS = 8_000;

function shellEscapeSingle(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function appendTail(current: string, chunk: string): string {
  const next = current + chunk;
  if (next.length <= STDERR_TAIL_MAX_CHARS) {
    return next;
  }
  return next.slice(-STDERR_TAIL_MAX_CHARS);
}

function cleanStderrForMessage(stderr: string): string {
  const trimmed = stderr.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.length > 2_000 ? trimmed.slice(-2_000) : trimmed;
}

function toJsonLines(values: unknown[]): string {
  if (values.length === 0) {
    return "";
  }

  return `${values.map((value) => JSON.stringify(value)).join("\n")}\n`;
}

function buildSessionUserShellCommand(linuxUser: string, command: string): string[] {
  const escapedLinuxUser = shellEscapeSingle(linuxUser);
  const escapedCommand = shellEscapeSingle(command);

  const outerScript = [
    "set -eu",
    `home_dir=\"$(getent passwd ${escapedLinuxUser} | cut -d: -f6)\"`,
    'if [ -z "$home_dir" ]; then echo "Failed to resolve home directory" >&2; exit 1; fi',
    `export HOME=\"$home_dir\" USER=${escapedLinuxUser} LOGNAME=${escapedLinuxUser}`,
    'export SHELL="${SHELL:-/bin/bash}"',
    'export TERM="${TERM:-xterm-256color}"',
    'export LANG="${LANG:-C.UTF-8}"',
    'export LC_ALL="${LC_ALL:-C.UTF-8}"',
    'export TMPDIR="${TMPDIR:-/tmp}"',
    'export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"',
    'export XDG_CACHE_HOME="${XDG_CACHE_HOME:-$HOME/.cache}"',
    'export XDG_STATE_HOME="${XDG_STATE_HOME:-$HOME/.local/state}"',
    'mkdir -p "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME" "$XDG_STATE_HOME"',
    `exec su -m -s /bin/sh -c ${shellEscapeSingle(`exec sh -lc ${escapedCommand}`)} ${escapedLinuxUser}`,
  ].join("\n");

  return ["sh", "-lc", outerScript];
}

function buildAgentSdkEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value !== "string") {
      continue;
    }
    if (key === "ANTHROPIC_AUTH_TOKEN" || key === "CLAUDE_CODE_OAUTH_TOKEN") {
      continue;
    }
    env[key] = value;
  }

  env.SHELL ??= "/bin/bash";
  env.TERM ??= "xterm-256color";
  env.LANG ??= "C.UTF-8";
  env.LC_ALL ??= "C.UTF-8";
  env.TMPDIR ??= "/tmp";

  return env;
}

export async function ensureSessionRuntimeApiReady(
  _providerSessionId: string,
  _options?: { deployIfNeeded?: boolean; forceRestart?: boolean },
): Promise<void> {
  // No-op: exec/agent are orchestrated directly from manager-app.
}

export async function callSessionRuntimeExec(
  providerSessionId: string,
  input: ExecSessionInput,
  linuxUser: string,
): Promise<SessionExecResult> {
  const cmd = input.cmd.trim();
  if (!cmd) {
    throw new SessionError("cmd must not be empty", 400);
  }

  return await runSessionSandboxCommand(
    providerSessionId,
    buildSessionUserShellCommand(linuxUser, cmd),
    {
      workdir: input.cwd,
      pty: input.pty,
      timeoutMs: SESSION_RUNTIME_API_REQUEST_TIMEOUT_MS,
    },
  );
}

export async function callSessionRuntimeAgent(
  providerSessionId: string,
  input: AgentSessionInput,
  claudeToken: string,
  timeoutMs: number,
  linuxUser: string,
): Promise<SessionExecResult> {
  const prompt = input.prompt.trim();
  const cwd = input.cwd?.trim();
  if (!prompt) {
    throw new SessionError("prompt must not be empty", 400);
  }
  if (!cwd) {
    throw new SessionError("cwd must not be empty", 400);
  }

  const sandbox = await getModalClient().sandboxes.fromId(providerSessionId);
  const claudeTokenSecret = await getModalClient().secrets.fromObject({
    ANTHROPIC_AUTH_TOKEN: claudeToken,
    CLAUDE_CODE_OAUTH_TOKEN: claudeToken,
  });

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), timeoutMs);
  timeout.unref?.();

  const maxTurns = Math.min(20, Math.max(1, input.maxTurns ?? 8));
  const events: SDKMessage[] = [];
  let stderrTail = "";

  const options: Options = {
    cwd,
    maxTurns,
    abortController,
    pathToClaudeCodeExecutable: CLAUDE_CODE_PATH_IN_SESSION,
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    env: buildAgentSdkEnv(),
    spawnClaudeCodeProcess: (spawnOptions) =>
      new ModalExecSpawnedProcessAdapter({
        sandbox,
        spawnOptions,
        linuxUser,
        timeoutMs,
        runId: randomUUID(),
        secrets: [claudeTokenSecret],
        onStderrChunk: (chunk) => {
          stderrTail = appendTail(stderrTail, chunk);
        },
      }),
  };

  try {
    for await (const message of query({ prompt, options })) {
      events.push(message);
    }
  } catch (error) {
    const stderrMessage = cleanStderrForMessage(stderrTail);
    const baseMessage = error instanceof Error ? error.message : "Agent execution failed";
    const timeoutHint = abortController.signal.aborted
      ? "Agent execution timed out or was aborted"
      : baseMessage;
    const message = stderrMessage
      ? `${timeoutHint}\nClaude Code stderr (tail):\n${stderrMessage}`
      : timeoutHint;

    console.error("session agent execution failed", {
      providerSessionId,
      linuxUser,
      cwd,
      maxTurns,
      aborted: abortController.signal.aborted,
      stderrTail: stderrMessage || undefined,
    }, error);
    throw new SessionError(message, 502);
  } finally {
    clearTimeout(timeout);
  }

  return {
    stdout: toJsonLines(events),
    stderr: "",
    exitCode: 0,
  };
}
