export type SessionStatus = "creating" | "running" | "terminated" | "error";

export type SessionSshInfo = {
  user: string;
  host: string;
  port: number;
  hostKeyFingerprint: string;
  knownHostsEntry: string;
  command: string;
};

export type SessionRecord = {
  id: string;
  name: string;
  repoUrl: string;
  repoRef: string;
  status: SessionStatus;
  workspacePath: string;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
  ssh?: SessionSshInfo | null;
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

