import { desc, eq } from "drizzle-orm";
import type { SessionRecord } from "@/lib/session-types";
import type { AppDb } from "@/server/db";
import type { SessionRow } from "@/server/db/schema";
import { sessions } from "@/server/db/schema";

export type SessionStoreRecord = SessionRecord & {
  providerSessionId: string;
};

function toSessionRecord(row: SessionRow): SessionStoreRecord {
  return {
    id: row.id,
    providerSessionId: row.providerSessionId,
    name: row.name,
    repoUrl: row.repoUrl,
    repoRef: row.repoRef,
    status: row.status,
    workspacePath: row.workspacePath,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastError: row.lastError ?? undefined,
  };
}

export function listSessions(db: AppDb): SessionStoreRecord[] {
  const rows = db
    .select()
    .from(sessions)
    .orderBy(desc(sessions.updatedAt))
    .all();
  return rows.map(toSessionRecord);
}

export function getSession(db: AppDb, id: string): SessionStoreRecord | null {
  const row = db.select().from(sessions).where(eq(sessions.id, id)).get();
  return row ? toSessionRecord(row) : null;
}

export function insertSession(db: AppDb, record: SessionStoreRecord): void {
  db.insert(sessions)
    .values({
      id: record.id,
      providerSessionId: record.providerSessionId,
      name: record.name,
      repoUrl: record.repoUrl,
      repoRef: record.repoRef,
      status: record.status,
      workspacePath: record.workspacePath,
      lastError: record.lastError ?? null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    })
    .run();
}

export function updateSession(
  db: AppDb,
  id: string,
  updates: Partial<Omit<SessionStoreRecord, "id" | "createdAt">>,
): SessionStoreRecord | null {
  const current = getSession(db, id);
  if (!current) {
    return null;
  }

  const next: SessionStoreRecord = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  db.update(sessions)
    .set({
      providerSessionId: next.providerSessionId,
      name: next.name,
      repoUrl: next.repoUrl,
      repoRef: next.repoRef,
      status: next.status,
      workspacePath: next.workspacePath,
      lastError: next.lastError ?? null,
      updatedAt: next.updatedAt,
    })
    .where(eq(sessions.id, id))
    .run();

  return next;
}

export function deleteSession(db: AppDb, id: string): boolean {
  const result = db.delete(sessions).where(eq(sessions.id, id)).run();
  return result.changes > 0;
}
