import { spawn } from "node:child_process";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Options, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { AgentRequest, AgentResponse } from "../types.js";

const STDERR_TAIL_MAX_CHARS = 8_000;

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

  return trimmed.length > 2_000 ? `${trimmed.slice(-2_000)}` : trimmed;
}

function buildAgentEnv(claudeToken: string): NodeJS.ProcessEnv {
  const home = process.env.HOME?.trim() || "/tmp";
  return {
    ...process.env,
    ANTHROPIC_AUTH_TOKEN: claudeToken,
    CLAUDE_CODE_OAUTH_TOKEN: claudeToken,
    SHELL: process.env.SHELL || "/bin/bash",
    TERM: process.env.TERM || "xterm-256color",
    LANG: process.env.LANG || "C.UTF-8",
    LC_ALL: process.env.LC_ALL || "C.UTF-8",
    TMPDIR: process.env.TMPDIR || "/tmp",
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME || `${home}/.config`,
    XDG_CACHE_HOME: process.env.XDG_CACHE_HOME || `${home}/.cache`,
    XDG_STATE_HOME: process.env.XDG_STATE_HOME || `${home}/.local/state`,
  };
}

export async function runAgentQuery(
  input: AgentRequest,
  claudeToken: string,
): Promise<AgentResponse> {
  const prompt = input.prompt.trim();
  const cwd = input.cwd?.trim() || process.cwd();
  const maxTurns = Math.min(20, Math.max(1, input.maxTurns ?? 8));
  const events: SDKMessage[] = [];
  let stderrTail = "";
  const agentEnv = buildAgentEnv(claudeToken);
  const options: Options = {
    cwd,
    maxTurns,
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    env: agentEnv,
    stderr: (data) => {
      stderrTail = appendTail(stderrTail, data);
    },
    spawnClaudeCodeProcess: (spawnOptions) =>
      spawn(spawnOptions.command, spawnOptions.args, {
        cwd: spawnOptions.cwd,
        env: spawnOptions.env as NodeJS.ProcessEnv,
        signal: spawnOptions.signal,
        stdio: ["pipe", "pipe", "pipe"],
      }),
  };

  try {
    for await (const message of query({ prompt, options })) {
      events.push(message);
    }
  } catch (error) {
    const stderrMessage = cleanStderrForMessage(stderrTail);
    const baseMessage = error instanceof Error ? error.message : "Agent execution failed";
    const message = stderrMessage
      ? `${baseMessage}\nClaude Code stderr (tail):\n${stderrMessage}`
      : baseMessage;

    const debugMeta = {
      cwd,
      maxTurns,
      permissionMode: "bypassPermissions",
      promptLength: prompt.length,
      stderrTail: stderrMessage || undefined,
    };
    if (error instanceof Error) {
      console.error("session-runtime-api agent execution failed", debugMeta, error);
      throw new Error(message, { cause: error });
    }

    console.error("session-runtime-api agent execution failed", debugMeta, error);
    throw new Error(message);
  }

  return { events };
}
