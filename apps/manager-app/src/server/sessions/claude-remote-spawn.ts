import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import path from "node:path";
import { PassThrough, type Readable, type Writable } from "node:stream";
import type {
  SpawnedProcess,
  SpawnOptions,
} from "@anthropic-ai/claude-agent-sdk";
import { NotFoundError, type Secret } from "modal";
import { getModalClient } from "@/server/modal/client";

type SpawnObserverState = {
  sessionMissing: boolean;
};

type CreateModalClaudeSpawnerParams = {
  providerSessionId: string;
  linuxUser: string;
  apiKey: string;
  timeoutMs: number;
  onStderrChunk?: (chunk: string) => void;
};

type ModalExecProcess = {
  stdin: {
    writeText(text: string): Promise<void>;
    close(): Promise<void>;
  };
  stdout: ReadableStream<string>;
  stderr: ReadableStream<string>;
  wait(): Promise<number>;
};

type ModalClaudeSpawner = {
  spawnClaudeCodeProcess: (options: SpawnOptions) => SpawnedProcess;
  state: SpawnObserverState;
};

const CLAUDE_AUTH_ENV_NAMES = ["ANTHROPIC_API_KEY"];
const REMOTE_SDK_CLI_PATH =
  "/opt/claude-code-sdk/node_modules/@anthropic-ai/claude-agent-sdk/cli.js";

export function createModalClaudeSpawner(
  params: CreateModalClaudeSpawnerParams,
): ModalClaudeSpawner {
  const modal = getModalClient();
  const state: SpawnObserverState = {
    sessionMissing: false,
  };
  const secretPromise = modal.secrets.fromObject({
    ANTHROPIC_API_KEY: params.apiKey,
  });

  return {
    spawnClaudeCodeProcess(options) {
      return new ModalClaudeSpawnedProcess({
        providerSessionId: params.providerSessionId,
        linuxUser: params.linuxUser,
        timeoutMs: params.timeoutMs,
        options,
        secretPromise,
        onStderrChunk: params.onStderrChunk,
        onSessionMissing() {
          state.sessionMissing = true;
        },
      });
    },
    state,
  };
}

type ModalClaudeSpawnedProcessParams = {
  providerSessionId: string;
  linuxUser: string;
  timeoutMs: number;
  options: SpawnOptions;
  secretPromise: Promise<Secret>;
  onStderrChunk?: (chunk: string) => void;
  onSessionMissing: () => void;
};

class ModalClaudeSpawnedProcess extends EventEmitter implements SpawnedProcess {
  stdin: Writable;
  stdout: Readable;
  readonly stderr: Readable;
  killed = false;
  exitCode: number | null = null;

  private readonly stdinBuffer = new PassThrough();
  private readonly stdoutBuffer = new PassThrough();
  private readonly stderrBuffer = new PassThrough();
  private readonly pidFilePath = `/tmp/claude-code-${randomUUID()}.pid`;
  private readonly params: ModalClaudeSpawnedProcessParams;
  private readonly abortHandler: () => void;
  private remoteProcess: ModalExecProcess | null = null;
  private sandboxExecReady = false;
  private pendingSignal: NodeJS.Signals | null = null;
  private signalAttempts = new Set<NodeJS.Signals>();

  constructor(params: ModalClaudeSpawnedProcessParams) {
    super();
    this.params = params;
    this.stdin = this.stdinBuffer;
    this.stdout = this.stdoutBuffer;
    this.stderr = this.stderrBuffer;
    this.abortHandler = () => {
      this.kill("SIGTERM");
    };
    params.options.signal.addEventListener("abort", this.abortHandler, {
      once: true,
    });
    queueMicrotask(() => {
      void this.start();
    });
  }

  kill(signal: NodeJS.Signals): boolean {
    if (this.exitCode !== null) {
      return false;
    }
    if (!/^SIG[A-Z0-9]+$/.test(signal)) {
      return false;
    }

    this.killed = true;
    this.pendingSignal = signal;
    if (!this.sandboxExecReady) {
      return true;
    }

    this.trySendSignal(signal);
    return true;
  }

  private async start(): Promise<void> {
    try {
      const modal = getModalClient();
      const sandbox = await modal.sandboxes.fromId(
        this.params.providerSessionId,
      );
      const secret = await this.params.secretPromise;
      const execEnv = buildExecEnv(this.params.options.env, this.pidFilePath);
      const preserveEnv = [...Object.keys(execEnv), ...CLAUDE_AUTH_ENV_NAMES];
      const command = buildClaudeExecCommand({
        linuxUser: this.params.linuxUser,
        preserveEnv,
        claudeCommand: this.params.options.command,
        claudeArgs: this.params.options.args,
      });

      this.remoteProcess = await sandbox.exec(command, {
        pty: false,
        timeoutMs: this.params.timeoutMs,
        workdir: this.params.options.cwd,
        env: execEnv,
        secrets: [secret],
      });
      this.sandboxExecReady = true;

      if (this.pendingSignal) {
        this.trySendSignal(this.pendingSignal);
      }

      void this.pipeStdinToRemote(this.remoteProcess);
      const outputPipeTasks = [
        this.pipeStreamToNode(this.remoteProcess.stdout, this.stdoutBuffer),
        this.pipeStderrToNode(this.remoteProcess.stderr, this.stderrBuffer),
      ];

      const exitCode = await this.remoteProcess.wait();
      // SDK can keep stdin open longer than the remote process lifetime.
      // Force-stop the local stdin pump so exit is surfaced promptly.
      this.stdinBuffer.destroy();
      await Promise.allSettled(outputPipeTasks);
      this.finish(exitCode, null);
    } catch (error) {
      if (error instanceof NotFoundError) {
        this.params.onSessionMissing();
      }
      this.emitError(error);
      this.finish(1, null);
    }
  }

  private finish(exitCode: number, signal: NodeJS.Signals | null): void {
    if (this.exitCode !== null) {
      return;
    }

    this.exitCode = exitCode;
    this.cleanup();
    if (!this.stdinBuffer.destroyed) {
      this.stdinBuffer.destroy();
    }
    this.stdoutBuffer.end();
    this.stderrBuffer.end();
    this.emit("exit", exitCode, signal);
  }

  private cleanup(): void {
    this.params.options.signal.removeEventListener("abort", this.abortHandler);
  }

  private emitError(error: unknown): void {
    const normalized =
      error instanceof Error
        ? error
        : new Error(String(error ?? "Unknown error"));
    this.emit("error", normalized);
  }

  private async pipeStdinToRemote(remote: ModalExecProcess): Promise<void> {
    const decoder = new TextDecoder();
    try {
      for await (const chunk of this.stdinBuffer) {
        const text =
          typeof chunk === "string"
            ? chunk
            : decoder.decode(chunk as Uint8Array, { stream: true });
        if (text) {
          await remote.stdin.writeText(text);
        }
      }
      const tail = decoder.decode();
      if (tail) {
        await remote.stdin.writeText(tail);
      }
      await remote.stdin.close();
    } catch (error) {
      void error;
    }
  }

  private async pipeStreamToNode(
    source: ReadableStream<string>,
    target: PassThrough,
  ): Promise<void> {
    const reader = source.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        if (value) {
          target.write(value);
        }
      }
    } catch (error) {
      if (this.exitCode === null) {
        this.emitError(error);
      }
    } finally {
      reader.releaseLock();
    }
  }

  private async pipeStderrToNode(
    source: ReadableStream<string>,
    target: PassThrough,
  ): Promise<void> {
    const reader = source.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        if (!value) {
          continue;
        }
        target.write(value);
        this.params.onStderrChunk?.(value);
      }
    } catch (error) {
      if (this.exitCode === null) {
        this.emitError(error);
      }
    } finally {
      reader.releaseLock();
    }
  }

  private trySendSignal(signal: NodeJS.Signals): void {
    if (this.signalAttempts.has(signal)) {
      return;
    }
    this.signalAttempts.add(signal);
    void this.sendSignal(signal);
  }

  private async sendSignal(signal: NodeJS.Signals): Promise<void> {
    try {
      const modal = getModalClient();
      const sandbox = await modal.sandboxes.fromId(
        this.params.providerSessionId,
      );
      await sandbox.exec(
        [
          "sh",
          "-lc",
          `if [ -s "$PID_FILE" ]; then kill -s "$SIGNAL" "$(cat "$PID_FILE")" 2>/dev/null || true; fi`,
        ],
        {
          pty: false,
          timeoutMs: 5_000,
          env: {
            PID_FILE: this.pidFilePath,
            SIGNAL: signal,
          },
        },
      );
    } catch (error) {
      if (error instanceof NotFoundError) {
        this.params.onSessionMissing();
        return;
      }
      // Best-effort signal delivery. Ignore failures here.
    }
  }
}

function buildExecEnv(
  source: SpawnOptions["env"],
  pidFilePath: string,
): Record<string, string> {
  const env: Record<string, string> = {
    CLAUDE_REMOTE_PID_FILE: pidFilePath,
    DISABLE_AUTOUPDATER: "1",
  };

  for (const [key, value] of Object.entries(source)) {
    if (typeof value !== "string") {
      continue;
    }
    if (!shouldForwardSpawnEnvVar(key)) {
      continue;
    }
    if (value.length === 0 && key !== "CLAUDE_CODE_ENTRYPOINT") {
      continue;
    }
    env[key] = value;
  }

  return env;
}

function shouldForwardSpawnEnvVar(key: string): boolean {
  if (key === "CLAUDE_CODE_ENTRYPOINT" || key === "CLAUDE_AGENT_SDK_VERSION") {
    return true;
  }
  if (key.startsWith("CLAUDE_")) {
    return true;
  }
  if (key.startsWith("ANTHROPIC_")) {
    return true;
  }
  if (key === "TERM" || key === "COLORTERM" || key === "FORCE_COLOR") {
    return true;
  }
  if (key === "LANG" || key === "LC_ALL") {
    return true;
  }
  if (key.startsWith("LC_")) {
    return true;
  }
  if (key === "CI" || key === "NO_COLOR" || key === "NODE_ENV") {
    return true;
  }

  return false;
}

function looksLikeSdkCliPath(value: string): boolean {
  const normalized = value.replaceAll("\\", "/");
  return (
    normalized.endsWith("/@anthropic-ai/claude-agent-sdk/cli.js") ||
    normalized.includes("/@anthropic-ai+claude-agent-sdk@") ||
    /\/claude-agent-sdk(?:\/|@).*\/cli\.js$/.test(normalized)
  );
}

function buildClaudeExecCommand(params: {
  linuxUser: string;
  preserveEnv: string[];
  claudeCommand: string;
  claudeArgs: string[];
}): string[] {
  const preserveEnv = Array.from(new Set(params.preserveEnv));
  const invocation = resolveRemoteClaudeInvocation(
    params.claudeCommand,
    params.claudeArgs,
  );
  const remoteCommand =
    path.basename(invocation.command) === "node"
      ? "/usr/local/bin/node"
      : invocation.command;

  return [
    "sudo",
    "-H",
    `--preserve-env=${preserveEnv.join(",")}`,
    "-u",
    params.linuxUser,
    "sh",
    "-lc",
    'printf "%s" "$$" > "$CLAUDE_REMOTE_PID_FILE"; exec "$@"',
    "claude-remote",
    remoteCommand,
    ...invocation.args,
  ];
}

function resolveRemoteClaudeInvocation(
  command: string,
  args: string[],
): { command: string; args: string[] } {
  const commandBase = path.basename(command);

  if (
    (commandBase === "node" || commandBase === "bun") &&
    args[0] &&
    looksLikeSdkCliPath(args[0])
  ) {
    return {
      command,
      args: [REMOTE_SDK_CLI_PATH, ...args.slice(1)],
    };
  }

  if (looksLikeSdkCliPath(command)) {
    return {
      command: REMOTE_SDK_CLI_PATH,
      args,
    };
  }

  if (commandBase === "claude") {
    return {
      command: "/usr/local/bin/claude",
      args,
    };
  }

  return { command, args };
}
