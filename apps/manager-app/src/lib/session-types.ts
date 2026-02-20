export type SessionStatus = "creating" | "running" | "terminated" | "error";

export type SessionRecord = {
  id: string;
  name: string;
  repoUrl: string;
  repoRef: string;
  status: SessionStatus;
  workspacePath: string;
  terminalUrl?: string;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
};

export type SessionExecResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export type CreateSessionInput = {
  name?: string;
  repoUrl?: string;
  repoRef?: string;
};

export type ExecSessionInput = {
  cmd: string;
  cwd?: string;
  pty?: boolean;
};
