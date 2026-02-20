import type { SessionRecord, SessionStatus } from "@/lib/session-types";
import { getDb } from "@/server/db";

export type SessionStoreRecord = SessionRecord & {
  providerSessionId: string;
};

type SessionRow = {
  id: string;
  provider_session_id: string;
  name: string;
  repo_url: string;
  repo_ref: string;
  status: SessionStatus;
  workspace_path: string;
  created_at: string;
  updated_at: string;
  last_error: string | null;
};

function toSessionRecord(row: SessionRow): SessionStoreRecord {
  return {
    id: row.id,
    providerSessionId: row.provider_session_id,
    name: row.name,
    repoUrl: row.repo_url,
    repoRef: row.repo_ref,
    status: row.status,
    workspacePath: row.workspace_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastError: row.last_error ?? undefined,
  };
}

export function listSessions(): SessionStoreRecord[] {
  const rows = getDb()
    .prepare("SELECT * FROM sessions ORDER BY datetime(updated_at) DESC")
    .all() as SessionRow[];
  return rows.map(toSessionRecord);
}

export function getSession(id: string): SessionStoreRecord | null {
  const row = getDb().prepare("SELECT * FROM sessions WHERE id = ?").get(id) as
    | SessionRow
    | undefined;
  return row ? toSessionRecord(row) : null;
}

export function insertSession(record: SessionStoreRecord): void {
  getDb()
    .prepare(
      `
      INSERT INTO sessions (
        id,
        provider_session_id,
        name,
        repo_url,
        repo_ref,
        status,
        workspace_path,
        last_error,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      record.id,
      record.providerSessionId,
      record.name,
      record.repoUrl,
      record.repoRef,
      record.status,
      record.workspacePath,
      record.lastError ?? null,
      record.createdAt,
      record.updatedAt,
    );
}

export function updateSession(
  id: string,
  updates: Partial<Omit<SessionStoreRecord, "id" | "createdAt">>,
): SessionStoreRecord | null {
  const current = getSession(id);
  if (!current) {
    return null;
  }

  const next: SessionStoreRecord = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  getDb()
    .prepare(
      `
      UPDATE sessions
      SET
        provider_session_id = ?,
        name = ?,
        repo_url = ?,
        repo_ref = ?,
        status = ?,
        workspace_path = ?,
        last_error = ?,
        updated_at = ?
      WHERE id = ?
      `,
    )
    .run(
      next.providerSessionId,
      next.name,
      next.repoUrl,
      next.repoRef,
      next.status,
      next.workspacePath,
      next.lastError ?? null,
      next.updatedAt,
      id,
    );

  return next;
}

export function deleteSession(id: string): boolean {
  const result = getDb().prepare("DELETE FROM sessions WHERE id = ?").run(id);
  return result.changes > 0;
}
