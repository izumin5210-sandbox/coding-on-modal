import type { ExecRequest, ExecResult } from "../types.js";
import { runCommand } from "./process.js";

export async function executeShell(input: ExecRequest): Promise<ExecResult> {
  const cmd = input.cmd.trim();
  const cwd = input.cwd?.trim() || undefined;

  if (input.pty) {
    // `script` provides a best-effort PTY-compatible execution path.
    const result = await runCommand(["script", "-q", "-e", "-c", cmd, "/dev/null"], {
      cwd,
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  }

  return runCommand(["sh", "-lc", cmd], {
    cwd,
  });
}
