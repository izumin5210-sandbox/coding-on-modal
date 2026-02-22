import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Options, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { AgentRequest, AgentResponse } from "../types.js";

export async function runAgentQuery(
  input: AgentRequest,
  claudeToken: string,
): Promise<AgentResponse> {
  const prompt = input.prompt.trim();
  const cwd = input.cwd?.trim() || process.cwd();
  const maxTurns = Math.min(20, Math.max(1, input.maxTurns ?? 8));
  const events: SDKMessage[] = [];
  const options: Options = {
    cwd,
    maxTurns,
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    env: {
      ...process.env,
      ANTHROPIC_AUTH_TOKEN: claudeToken,
      CLAUDE_CODE_OAUTH_TOKEN: claudeToken,
    },
  };

  for await (const message of query({ prompt, options })) {
    events.push(message);
  }

  return { events };
}
