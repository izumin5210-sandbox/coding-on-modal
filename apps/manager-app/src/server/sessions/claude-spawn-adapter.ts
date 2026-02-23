import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { Readable, Writable } from "node:stream";
import path from "node:path";
import type { SpawnOptions, SpawnedProcess } from "@anthropic-ai/claude-agent-sdk/transport/processTransportTypes";
import type { Secret, Sandbox } from "modal";

const CLAUDE_SPAWN_TMP_DIR = "/tmp/claude-sdk-spawn";

type ExitListener = (code: number | null, signal: NodeJS.Signals | null) => void;
type ErrorListener = (error: Error) => void;

type ModalExecSpawnedProcessAdapterParams = {
  sandbox: Sandbox;
  spawnOptions: SpawnOptions;
  linuxUser: string;
  runId: string;
  timeoutMs: number;
  secrets?: Secret[];
  onStderrChunk?: (chunk: string) => void;
};

function shellEscapeSingle(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function filterEnv(
  source: Record<string, string | undefined>,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string") {
      env[key] = value;
    }
  }
  return env;
}

function buildClaudeModalCommand(
  linuxUser: string,
  spawnOptions: SpawnOptions,
  pidFilePath: string,
  pgidFilePath: string,
): string[] {
  const escapedLinuxUser = shellEscapeSingle(linuxUser);
  const escapedPidFile = shellEscapeSingle(pidFilePath);
  const escapedPgidFile = shellEscapeSingle(pgidFilePath);
  const escapedTmpDir = shellEscapeSingle(path.posix.dirname(pidFilePath));
  const claudeCommandLine = [spawnOptions.command, ...spawnOptions.args]
    .map(shellEscapeSingle)
    .join(" ");

  const claudeExecScriptWithSetsid = [
    "set -eu",
    `mkdir -p ${escapedTmpDir}`,
    `rm -f ${escapedPidFile} ${escapedPgidFile}`,
    `echo \"$$\" > ${escapedPidFile}`,
    `echo \"$$\" > ${escapedPgidFile}`,
    `exec ${claudeCommandLine}`,
  ].join("\n");

  const claudeExecScriptWithoutSetsid = [
    "set -eu",
    `mkdir -p ${escapedTmpDir}`,
    `rm -f ${escapedPidFile} ${escapedPgidFile}`,
    `echo \"$$\" > ${escapedPidFile}`,
    `exec ${claudeCommandLine}`,
  ].join("\n");

  const userScript = [
    "set -eu",
    "if command -v setsid >/dev/null 2>&1; then",
    `  exec setsid sh -lc ${shellEscapeSingle(claudeExecScriptWithSetsid)}`,
    "fi",
    `exec sh -lc ${shellEscapeSingle(claudeExecScriptWithoutSetsid)}`,
  ].join("\n");

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
    `exec su -m -s /bin/sh -c ${shellEscapeSingle(userScript)} ${escapedLinuxUser}`,
  ].join("\n");

  return ["sh", "-lc", outerScript];
}

export class ModalExecSpawnedProcessAdapter implements SpawnedProcess {
  readonly stdin: Writable;
  readonly stdout: Readable;

  private readonly eventEmitter = new EventEmitter();
  private readonly stdinPipe = new PassThrough();
  private readonly stdoutPipe = new PassThrough();
  private readonly stderrPipe = new PassThrough();
  private readonly pidFilePath: string;
  private readonly pgidFilePath: string;
  private readonly sandbox: Sandbox;
  private readonly spawnOptions: SpawnOptions;
  private readonly linuxUser: string;
  private readonly timeoutMs: number;
  private readonly secrets?: Secret[];
  private readonly onStderrChunk?: (chunk: string) => void;

  private killedFlag = false;
  private exitCodeValue: number | null = null;
  private killSignalIssued: NodeJS.Signals | null = null;
  private hasEmittedTerminalEvent = false;

  constructor(params: ModalExecSpawnedProcessAdapterParams) {
    this.stdin = this.stdinPipe;
    this.stdout = this.stdoutPipe;
    this.sandbox = params.sandbox;
    this.spawnOptions = params.spawnOptions;
    this.linuxUser = params.linuxUser;
    this.timeoutMs = params.timeoutMs;
    this.secrets = params.secrets;
    this.onStderrChunk = params.onStderrChunk;
    this.pidFilePath = `${CLAUDE_SPAWN_TMP_DIR}/${params.runId}.pid`;
    this.pgidFilePath = `${CLAUDE_SPAWN_TMP_DIR}/${params.runId}.pgid`;

    this.stdoutPipe.setEncoding("utf8");
    this.stderrPipe.setEncoding("utf8");
    params.spawnOptions.signal.addEventListener("abort", () => {
      this.kill("SIGTERM");
    });
    void this.start();
  }

  get killed(): boolean {
    return this.killedFlag;
  }

  get exitCode(): number | null {
    return this.exitCodeValue;
  }

  kill(signal: NodeJS.Signals): boolean {
    if (this.exitCodeValue !== null) {
      return false;
    }

    this.killedFlag = true;
    this.killSignalIssued = signal;
    void this.issueKill(signal);
    return true;
  }

  on(event: "exit", listener: ExitListener): void;
  on(event: "error", listener: ErrorListener): void;
  on(event: "exit" | "error", listener: ExitListener | ErrorListener): void {
    this.eventEmitter.on(event, listener as (...args: unknown[]) => void);
  }

  once(event: "exit", listener: ExitListener): void;
  once(event: "error", listener: ErrorListener): void;
  once(event: "exit" | "error", listener: ExitListener | ErrorListener): void {
    this.eventEmitter.once(event, listener as (...args: unknown[]) => void);
  }

  off(event: "exit", listener: ExitListener): void;
  off(event: "error", listener: ErrorListener): void;
  off(event: "exit" | "error", listener: ExitListener | ErrorListener): void {
    this.eventEmitter.off(event, listener as (...args: unknown[]) => void);
  }

  private async start(): Promise<void> {
    try {
      const process = await this.sandbox.exec(
        buildClaudeModalCommand(
          this.linuxUser,
          this.spawnOptions,
          this.pidFilePath,
          this.pgidFilePath,
        ),
        {
          stdout: "pipe",
          stderr: "pipe",
          workdir: this.spawnOptions.cwd,
          timeoutMs: this.timeoutMs,
          env: filterEnv(this.spawnOptions.env),
          secrets: this.secrets,
        },
      );

      const tasks = [
        this.pumpStdout(process.stdout),
        this.pumpStderr(process.stderr),
        this.forwardStdin(process.stdin),
        this.waitForExit(process),
      ];

      await Promise.allSettled(tasks);
    } catch (error) {
      this.stdoutPipe.end();
      this.stderrPipe.end();
      this.emitError(error instanceof Error ? error : new Error("Failed to start Claude Code in sandbox"));
    }
  }

  private async forwardStdin(modalStdin: WritableStream<string>): Promise<void> {
    const writer = modalStdin.getWriter();
    try {
      for await (const chunk of this.stdinPipe) {
        if (this.exitCodeValue !== null) {
          break;
        }
        const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
        if (!text) {
          continue;
        }
        await writer.write(text);
      }
    } catch (error) {
      if (this.exitCodeValue === null) {
        this.emitError(error instanceof Error ? error : new Error("Failed to forward stdin"));
      }
    } finally {
      try {
        await writer.close();
      } catch {
        // Ignore close failures during process teardown.
      }
      writer.releaseLock();
    }
  }

  private async pumpStdout(stdout: ReadableStream<string>): Promise<void> {
    const reader = stdout.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        if (typeof value === "string" && value.length > 0) {
          this.stdoutPipe.write(value);
        }
      }
    } catch (error) {
      if (this.exitCodeValue === null) {
        this.emitError(error instanceof Error ? error : new Error("Failed to read stdout"));
      }
    } finally {
      this.stdoutPipe.end();
      reader.releaseLock();
    }
  }

  private async pumpStderr(stderr: ReadableStream<string>): Promise<void> {
    const reader = stderr.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        if (typeof value === "string" && value.length > 0) {
          this.stderrPipe.write(value);
          this.onStderrChunk?.(value);
        }
      }
    } catch (error) {
      if (this.exitCodeValue === null) {
        this.emitError(error instanceof Error ? error : new Error("Failed to read stderr"));
      }
    } finally {
      this.stderrPipe.end();
      reader.releaseLock();
    }
  }

  private async waitForExit(process: { wait(): Promise<number> }): Promise<void> {
    try {
      const exitCode = await process.wait();
      this.exitCodeValue = exitCode;
      this.emitExitOnce(exitCode, null);
    } catch (error) {
      this.emitError(error instanceof Error ? error : new Error("Failed waiting for process exit"));
    } finally {
      void this.cleanupPidFiles();
    }
  }

  private emitExitOnce(code: number | null, signal: NodeJS.Signals | null): void {
    if (this.hasEmittedTerminalEvent) {
      return;
    }
    this.hasEmittedTerminalEvent = true;
    this.eventEmitter.emit("exit", code, signal);
  }

  private emitError(error: Error): void {
    if (this.hasEmittedTerminalEvent) {
      return;
    }
    this.hasEmittedTerminalEvent = true;
    this.eventEmitter.emit("error", error);
  }

  private async issueKill(signal: NodeJS.Signals): Promise<void> {
    const signalName = signal === "SIGKILL" ? "KILL" : "TERM";
    const killScript = [
      "set -eu",
      `dir=${shellEscapeSingle(CLAUDE_SPAWN_TMP_DIR)}`,
      `pidfile=${shellEscapeSingle(this.pidFilePath)}`,
      `pgidfile=${shellEscapeSingle(this.pgidFilePath)}`,
      "i=0",
      "while [ $i -lt 20 ]; do",
      '  if [ -f "$pgidfile" ] || [ -f "$pidfile" ]; then break; fi',
      "  i=$((i+1))",
      "  sleep 0.1",
      "done",
      'if [ -f "$pgidfile" ]; then',
      `  kill -${signalName} -- "-$(cat \"$pgidfile\")" || true`,
      "fi",
      'if [ -f "$pidfile" ]; then',
      `  kill -${signalName} -- "$(cat \"$pidfile\")" || true`,
      "fi",
    ].join("\n");

    try {
      const proc = await this.sandbox.exec(["sh", "-lc", killScript], {
        stdout: "ignore",
        stderr: "ignore",
        timeoutMs: 5_000,
      });
      await proc.wait();
    } catch {
      // Best-effort kill only.
    }
  }

  private async cleanupPidFiles(): Promise<void> {
    const cleanupScript = [
      "set -eu",
      `rm -f ${shellEscapeSingle(this.pidFilePath)} ${shellEscapeSingle(this.pgidFilePath)} || true`,
    ].join("\n");

    try {
      const proc = await this.sandbox.exec(["sh", "-lc", cleanupScript], {
        stdout: "ignore",
        stderr: "ignore",
        timeoutMs: 5_000,
      });
      await proc.wait();
    } catch {
      // Best-effort cleanup only.
    }
  }
}
