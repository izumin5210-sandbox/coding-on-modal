import { spawn } from "node:child_process";
import type { ExecResult } from "../types.js";

export async function runCommand(command: string[], options?: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), {
      cwd: options?.cwd,
      env: options?.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", reject);
    child.on("close", (code, signal) => {
      resolve({
        stdout,
        stderr: signal ? `${stderr}\nterminated by signal: ${signal}`.trim() : stderr,
        exitCode: code ?? 1,
      });
    });
  });
}
