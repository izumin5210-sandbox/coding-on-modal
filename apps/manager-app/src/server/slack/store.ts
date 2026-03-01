import { randomUUID } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import type { AppDb } from "@/server/db";
import {
  slackLinkTokens,
  slackThreadSessions,
  slackUserMappings,
  type SlackThreadSessionRow,
} from "@/server/db/schema";

// ---------------------------------------------------------------------------
// Slack thread ↔ Session mapping
// ---------------------------------------------------------------------------

export type SlackThreadSessionRecord = {
  id: string;
  slackTeamId: string;
  slackChannelId: string;
  slackThreadTs: string;
  sessionId: string;
  ownerUserId: string;
  lastPostedMessageId: string | null;
  createdAt: string;
  updatedAt: string;
};

function toRecord(row: SlackThreadSessionRow): SlackThreadSessionRecord {
  return {
    id: row.id,
    slackTeamId: row.slackTeamId,
    slackChannelId: row.slackChannelId,
    slackThreadTs: row.slackThreadTs,
    sessionId: row.sessionId,
    ownerUserId: row.ownerUserId,
    lastPostedMessageId: row.lastPostedMessageId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function getSlackThreadSession(
  db: AppDb,
  slackTeamId: string,
  slackChannelId: string,
  slackThreadTs: string,
): SlackThreadSessionRecord | null {
  const row = db
    .select()
    .from(slackThreadSessions)
    .where(
      and(
        eq(slackThreadSessions.slackTeamId, slackTeamId),
        eq(slackThreadSessions.slackChannelId, slackChannelId),
        eq(slackThreadSessions.slackThreadTs, slackThreadTs),
      ),
    )
    .get();
  return row ? toRecord(row) : null;
}

export function getSlackThreadSessionBySessionId(
  db: AppDb,
  sessionId: string,
): SlackThreadSessionRecord | null {
  const row = db
    .select()
    .from(slackThreadSessions)
    .where(eq(slackThreadSessions.sessionId, sessionId))
    .get();
  return row ? toRecord(row) : null;
}

export function createSlackThreadSession(
  db: AppDb,
  input: {
    slackTeamId: string;
    slackChannelId: string;
    slackThreadTs: string;
    sessionId: string;
    ownerUserId: string;
  },
): SlackThreadSessionRecord {
  const now = new Date().toISOString();
  const id = `sts_${randomUUID().replaceAll("-", "")}`;

  db.insert(slackThreadSessions)
    .values({
      id,
      slackTeamId: input.slackTeamId,
      slackChannelId: input.slackChannelId,
      slackThreadTs: input.slackThreadTs,
      sessionId: input.sessionId,
      ownerUserId: input.ownerUserId,
      lastPostedMessageId: null,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return {
    id,
    ...input,
    lastPostedMessageId: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateLastPostedMessageId(
  db: AppDb,
  id: string,
  lastPostedMessageId: string,
): void {
  db.update(slackThreadSessions)
    .set({
      lastPostedMessageId,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(slackThreadSessions.id, id))
    .run();
}

// ---------------------------------------------------------------------------
// Slack user ↔ App user mapping
// ---------------------------------------------------------------------------

export function resolveUserIdFromSlackUser(
  db: AppDb,
  slackUserId: string,
  slackTeamId: string,
): string | null {
  const row = db
    .select({ userId: slackUserMappings.userId })
    .from(slackUserMappings)
    .where(
      and(
        eq(slackUserMappings.slackUserId, slackUserId),
        eq(slackUserMappings.slackTeamId, slackTeamId),
      ),
    )
    .get();
  return row?.userId ?? null;
}

export function upsertSlackUserMapping(
  db: AppDb,
  input: {
    slackUserId: string;
    slackTeamId: string;
    userId: string;
  },
): void {
  const now = new Date().toISOString();
  const existing = db
    .select()
    .from(slackUserMappings)
    .where(
      and(
        eq(slackUserMappings.slackUserId, input.slackUserId),
        eq(slackUserMappings.slackTeamId, input.slackTeamId),
      ),
    )
    .get();

  if (existing) {
    db.update(slackUserMappings)
      .set({ userId: input.userId, updatedAt: now })
      .where(eq(slackUserMappings.id, existing.id))
      .run();
  } else {
    db.insert(slackUserMappings)
      .values({
        id: `sum_${randomUUID().replaceAll("-", "")}`,
        slackUserId: input.slackUserId,
        slackTeamId: input.slackTeamId,
        userId: input.userId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }
}

// ---------------------------------------------------------------------------
// One-time link tokens for Slack ↔ App user binding
// ---------------------------------------------------------------------------

const LINK_TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function createLinkToken(
  db: AppDb,
  slackUserId: string,
  slackTeamId: string,
): string {
  const token = randomUUID();
  const now = new Date();
  db.insert(slackLinkTokens)
    .values({
      id: `slt_${randomUUID().replaceAll("-", "")}`,
      token,
      slackUserId,
      slackTeamId,
      expiresAt: new Date(now.getTime() + LINK_TOKEN_TTL_MS).toISOString(),
      createdAt: now.toISOString(),
    })
    .run();
  return token;
}

export function consumeLinkToken(
  db: AppDb,
  token: string,
): { slackUserId: string; slackTeamId: string } | null {
  return db.transaction((tx) => {
    const row = tx
      .select()
      .from(slackLinkTokens)
      .where(
        and(
          eq(slackLinkTokens.token, token),
          gt(slackLinkTokens.expiresAt, new Date().toISOString()),
        ),
      )
      .get();

    if (!row) return null;

    tx.delete(slackLinkTokens)
      .where(eq(slackLinkTokens.id, row.id))
      .run();

    return {
      slackUserId: row.slackUserId,
      slackTeamId: row.slackTeamId,
    };
  });
}
