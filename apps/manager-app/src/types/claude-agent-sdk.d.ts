declare module "@anthropic-ai/claude-agent-sdk/transport/processTransportTypes" {
  import type { Readable, Writable } from "node:stream";

  export interface SpawnedProcess {
    stdin: Writable;
    stdout: Readable;
    readonly killed: boolean;
    readonly exitCode: number | null;
    kill(signal: NodeJS.Signals): boolean;
    on(event: "exit", listener: (code: number | null, signal: NodeJS.Signals | null) => void): void;
    on(event: "error", listener: (error: Error) => void): void;
    once(event: "exit", listener: (code: number | null, signal: NodeJS.Signals | null) => void): void;
    once(event: "error", listener: (error: Error) => void): void;
    off(event: "exit", listener: (code: number | null, signal: NodeJS.Signals | null) => void): void;
    off(event: "error", listener: (error: Error) => void): void;
  }

  export interface SpawnOptions {
    command: string;
    args: string[];
    cwd?: string;
    env: Record<string, string | undefined>;
    signal: AbortSignal;
  }
}

declare module "@anthropic-ai/claude-agent-sdk" {
  import type { SpawnOptions, SpawnedProcess } from "@anthropic-ai/claude-agent-sdk/transport/processTransportTypes";

  export type SDKMessage = unknown;

  export type Options = {
    cwd?: string;
    maxTurns?: number;
    abortController?: AbortController;
    pathToClaudeCodeExecutable?: string;
    permissionMode?: "bypassPermissions" | string;
    allowDangerouslySkipPermissions?: boolean;
    env?: Record<string, string | undefined>;
    spawnClaudeCodeProcess?: (options: SpawnOptions) => SpawnedProcess;
    stderr?: (data: string) => void;
  };

  export function query(params: {
    prompt: string;
    options?: Options;
  }): AsyncIterable<SDKMessage>;
}
