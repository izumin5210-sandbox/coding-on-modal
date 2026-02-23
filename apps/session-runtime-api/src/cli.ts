import {
  SESSION_RUNTIME_CLI_CLAUDE_TOKEN_ENV,
  SESSION_RUNTIME_CLI_INPUT_B64_ENV,
} from "./constants.js";
import { runAgentQuery } from "./lib/agent.js";
import { executeShell } from "./lib/exec.js";
import {
  agentRequestSchema,
  agentResponseSchema,
  execRequestSchema,
  execResponseSchema,
} from "./types.js";

type CliSuccess = {
  ok: true;
  result: unknown;
};

type CliFailure = {
  ok: false;
  error: {
    message: string;
  };
};

function writeEnvelope(envelope: CliSuccess | CliFailure): void {
  process.stdout.write(`${JSON.stringify(envelope)}\n`);
}

function readInputFromEnv(): unknown {
  const inputB64 = process.env[SESSION_RUNTIME_CLI_INPUT_B64_ENV]?.trim();
  if (!inputB64) {
    throw new Error(`${SESSION_RUNTIME_CLI_INPUT_B64_ENV} is required`);
  }

  const json = Buffer.from(inputB64, "base64").toString("utf8");
  return JSON.parse(json) as unknown;
}

async function main(): Promise<void> {
  const subcommand = process.argv[2];
  const rawInput = readInputFromEnv();

  if (subcommand === "exec") {
    const input = execRequestSchema.parse(rawInput);
    const result = await executeShell(input);
    writeEnvelope({
      ok: true,
      result: execResponseSchema.parse({ result }).result,
    });
    return;
  }

  if (subcommand === "agent") {
    const claudeToken = process.env[SESSION_RUNTIME_CLI_CLAUDE_TOKEN_ENV]?.trim();
    if (!claudeToken) {
      throw new Error(`${SESSION_RUNTIME_CLI_CLAUDE_TOKEN_ENV} is required`);
    }

    const input = agentRequestSchema.parse(rawInput);
    const result = await runAgentQuery(input, claudeToken);
    writeEnvelope({
      ok: true,
      result: agentResponseSchema.parse(result),
    });
    return;
  }

  throw new Error(`Unknown subcommand: ${subcommand ?? ""}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Internal error";
  writeEnvelope({
    ok: false,
    error: { message },
  });
  process.exitCode = 1;
});
