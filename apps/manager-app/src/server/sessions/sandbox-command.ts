import type { Secret } from "modal";
import type { SessionExecResult } from "@/lib/session-types";
import { getModalClient } from "@/server/modal/client";

export type RunSessionSandboxCommandParams = {
  workdir?: string;
  pty?: boolean;
  timeoutMs?: number;
  env?: Record<string, string>;
  secrets?: Secret[];
};

export async function runSessionSandboxCommand(
  providerSessionId: string,
  command: string[],
  params?: RunSessionSandboxCommandParams,
): Promise<SessionExecResult> {
  const sandbox = await getModalClient().sandboxes.fromId(providerSessionId);
  const process = await sandbox.exec(command, {
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
