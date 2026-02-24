import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { SessionClaudeCodeThread } from "@/lib/session-chat-types";
import type { AppDb } from "@/server/db";
import type {
  SessionClaudeCodeMessageRow,
  SessionClaudeCodeThreadRow,
} from "@/server/db/schema";
import {
  sessionClaudeCodeMessages,
  sessionClaudeCodeThreads,
} from "@/server/db/schema";

export type ClaudeChatThreadStoreRecord = SessionClaudeCodeThread;

export type ClaudeChatRawMessageRecord = {
  id: string;
  threadId: string;
  sdkMessageJson: string;
  createdAt: string;
  updatedAt: string;
};

function toThreadRecord(
  row: SessionClaudeCodeThreadRow,
): ClaudeChatThreadStoreRecord {
  return {
    id: row.id,
    sessionId: row.sessionId,
    claudeSdkSessionId: row.claudeSdkSessionId ?? undefined,
    cwd: row.cwd,
    maxTurns: row.maxTurns,
    isRunning: row.isRunning,
    lastError: row.lastError ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toRawMessageRecord(
  row: SessionClaudeCodeMessageRow,
): ClaudeChatRawMessageRecord {
  return {
    id: row.id,
    threadId: row.threadId,
    sdkMessageJson: row.sdkMessageJson,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function getClaudeChatThreadBySessionId(
  db: AppDb,
  sessionId: string,
): ClaudeChatThreadStoreRecord | null {
  const row = db
    .select()
    .from(sessionClaudeCodeThreads)
    .where(eq(sessionClaudeCodeThreads.sessionId, sessionId))
    .get();
  return row ? toThreadRecord(row) : null;
}

export function ensureClaudeChatThread(
  db: AppDb,
  input: {
    sessionId: string;
    cwd: string;
    maxTurns: number;
  },
): ClaudeChatThreadStoreRecord {
  return db.transaction((tx) => {
    const existing = tx
      .select()
      .from(sessionClaudeCodeThreads)
      .where(eq(sessionClaudeCodeThreads.sessionId, input.sessionId))
      .get();
    if (existing) {
      return toThreadRecord(existing);
    }

    const now = new Date().toISOString();
    const id = `cct_${randomUUID().replaceAll("-", "")}`;

    tx.insert(sessionClaudeCodeThreads)
      .values({
        id,
        sessionId: input.sessionId,
        claudeSdkSessionId: null,
        cwd: input.cwd,
        maxTurns: input.maxTurns,
        isRunning: false,
        lastError: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    return {
      id,
      sessionId: input.sessionId,
      cwd: input.cwd,
      maxTurns: input.maxTurns,
      isRunning: false,
      createdAt: now,
      updatedAt: now,
    };
  });
}

export function updateClaudeChatThread(
  db: AppDb,
  threadId: string,
  updates: Partial<
    Pick<
      ClaudeChatThreadStoreRecord,
      "claudeSdkSessionId" | "cwd" | "maxTurns" | "isRunning" | "lastError"
    >
  >,
): ClaudeChatThreadStoreRecord | null {
  const current = db
    .select()
    .from(sessionClaudeCodeThreads)
    .where(eq(sessionClaudeCodeThreads.id, threadId))
    .get();
  if (!current) {
    return null;
  }

  const next: ClaudeChatThreadStoreRecord = {
    ...toThreadRecord(current),
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  db.update(sessionClaudeCodeThreads)
    .set({
      claudeSdkSessionId: next.claudeSdkSessionId ?? null,
      cwd: next.cwd,
      maxTurns: next.maxTurns,
      isRunning: next.isRunning,
      lastError: next.lastError ?? null,
      updatedAt: next.updatedAt,
    })
    .where(eq(sessionClaudeCodeThreads.id, threadId))
    .run();

  return next;
}

export function acquireClaudeChatThreadRunLock(
  db: AppDb,
  threadId: string,
): ClaudeChatThreadStoreRecord | null {
  const updated = db
    .update(sessionClaudeCodeThreads)
    .set({
      isRunning: true,
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(sessionClaudeCodeThreads.id, threadId),
        eq(sessionClaudeCodeThreads.isRunning, false),
      ),
    )
    .run();

  if (updated.changes < 1) {
    return null;
  }

  const row = db
    .select()
    .from(sessionClaudeCodeThreads)
    .where(eq(sessionClaudeCodeThreads.id, threadId))
    .get();
  return row ? toThreadRecord(row) : null;
}

export function releaseClaudeChatThreadRunLock(
  db: AppDb,
  threadId: string,
): ClaudeChatThreadStoreRecord | null {
  db.update(sessionClaudeCodeThreads)
    .set({
      isRunning: false,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(sessionClaudeCodeThreads.id, threadId))
    .run();

  const row = db
    .select()
    .from(sessionClaudeCodeThreads)
    .where(eq(sessionClaudeCodeThreads.id, threadId))
    .get();
  return row ? toThreadRecord(row) : null;
}

export function listClaudeChatRawMessages(
  db: AppDb,
  threadId: string,
): ClaudeChatRawMessageRecord[] {
  const rows = db
    .select()
    .from(sessionClaudeCodeMessages)
    .where(eq(sessionClaudeCodeMessages.threadId, threadId))
    .orderBy(
      asc(sessionClaudeCodeMessages.createdAt),
      asc(sessionClaudeCodeMessages.id),
    )
    .all();
  return rows.map(toRawMessageRecord);
}

export function appendClaudeChatRawMessages(
  db: AppDb,
  threadId: string,
  sdkMessageJsonList: string[],
): ClaudeChatRawMessageRecord[] {
  if (sdkMessageJsonList.length === 0) {
    return [];
  }

  const baseMs = Date.now();
  const rows: ClaudeChatRawMessageRecord[] = sdkMessageJsonList.map(
    (sdkMessageJson, index) => {
      const createdAt = new Date(baseMs + index).toISOString();
      return {
        id: `ccm_${baseMs}_${String(index).padStart(4, "0")}_${randomUUID().replaceAll("-", "")}`,
        threadId,
        sdkMessageJson,
        createdAt,
        updatedAt: createdAt,
      };
    },
  );

  db.insert(sessionClaudeCodeMessages)
    .values(
      rows.map((row) => ({
        id: row.id,
        threadId: row.threadId,
        sdkMessageJson: row.sdkMessageJson,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
    )
    .run();

  return rows;
}

export function deleteClaudeChatDataBySessionId(
  db: AppDb,
  sessionId: string,
): void {
  db.transaction((tx) => {
    const threadRows = tx
      .select({ id: sessionClaudeCodeThreads.id })
      .from(sessionClaudeCodeThreads)
      .where(eq(sessionClaudeCodeThreads.sessionId, sessionId))
      .all();

    for (const thread of threadRows) {
      tx.delete(sessionClaudeCodeMessages)
        .where(eq(sessionClaudeCodeMessages.threadId, thread.id))
        .run();
    }

    tx.delete(sessionClaudeCodeThreads)
      .where(eq(sessionClaudeCodeThreads.sessionId, sessionId))
      .run();
  });
}
