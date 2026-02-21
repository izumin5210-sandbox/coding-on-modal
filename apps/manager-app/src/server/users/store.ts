import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { AuthUser } from "@/lib/auth-types";
import type { AppDb } from "@/server/db";
import {
  claudeCredentials,
  type GithubAccountRow,
  githubAccounts,
  githubCredentials,
  users,
} from "@/server/db/schema";

function toAuthUser(account: GithubAccountRow): AuthUser {
  return {
    id: account.userId,
    github: {
      id: account.githubUserId,
      login: account.login,
      name: account.name ?? undefined,
      email: account.email ?? undefined,
      avatarUrl: account.avatarUrl ?? undefined,
    },
  };
}

type UpsertGithubAccountInput = {
  githubUserId: string;
  login: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
};

type UpsertGithubCredentialInput = {
  accessTokenEncrypted: string;
  refreshTokenEncrypted?: string;
  tokenType: string;
  scope?: string;
  expiresAt?: string;
};

export type GithubIdentityRecord = {
  userId: string;
  githubAccountId: string;
  githubUserId: string;
  login: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
};

export function getAuthUserById(db: AppDb, userId: string): AuthUser | null {
  const row = db
    .select()
    .from(githubAccounts)
    .where(eq(githubAccounts.userId, userId))
    .get();
  return row ? toAuthUser(row) : null;
}

export function upsertGithubIdentity(
  db: AppDb,
  input: UpsertGithubAccountInput,
): GithubIdentityRecord {
  return db.transaction((tx) => {
    const now = new Date().toISOString();
    const existing = tx
      .select()
      .from(githubAccounts)
      .where(eq(githubAccounts.githubUserId, input.githubUserId))
      .get();

    if (existing) {
      tx.update(githubAccounts)
        .set({
          login: input.login,
          name: input.name ?? null,
          email: input.email ?? null,
          avatarUrl: input.avatarUrl ?? null,
          updatedAt: now,
        })
        .where(eq(githubAccounts.id, existing.id))
        .run();

      return {
        userId: existing.userId,
        githubAccountId: existing.id,
        githubUserId: input.githubUserId,
        login: input.login,
        name: input.name,
        email: input.email,
        avatarUrl: input.avatarUrl,
      };
    }

    const userId = `usr_${randomUUID().replaceAll("-", "")}`;
    const githubAccountId = `gha_${randomUUID().replaceAll("-", "")}`;

    tx.insert(users)
      .values({
        id: userId,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    tx.insert(githubAccounts)
      .values({
        id: githubAccountId,
        userId,
        githubUserId: input.githubUserId,
        login: input.login,
        name: input.name ?? null,
        email: input.email ?? null,
        avatarUrl: input.avatarUrl ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    return {
      userId,
      githubAccountId,
      githubUserId: input.githubUserId,
      login: input.login,
      name: input.name,
      email: input.email,
      avatarUrl: input.avatarUrl,
    };
  });
}

export function upsertGithubCredential(
  db: AppDb,
  githubAccountId: string,
  input: UpsertGithubCredentialInput,
): void {
  db.transaction((tx) => {
    const now = new Date().toISOString();
    const existing = tx
      .select()
      .from(githubCredentials)
      .where(eq(githubCredentials.githubAccountId, githubAccountId))
      .get();

    if (existing) {
      tx.update(githubCredentials)
        .set({
          accessTokenEncrypted: input.accessTokenEncrypted,
          refreshTokenEncrypted: input.refreshTokenEncrypted ?? null,
          tokenType: input.tokenType,
          scope: input.scope ?? null,
          expiresAt: input.expiresAt ?? null,
          updatedAt: now,
        })
        .where(eq(githubCredentials.id, existing.id))
        .run();
      return;
    }

    tx.insert(githubCredentials)
      .values({
        id: `ghc_${randomUUID().replaceAll("-", "")}`,
        githubAccountId,
        accessTokenEncrypted: input.accessTokenEncrypted,
        refreshTokenEncrypted: input.refreshTokenEncrypted ?? null,
        tokenType: input.tokenType,
        scope: input.scope ?? null,
        expiresAt: input.expiresAt ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  });
}

export function getEncryptedGithubAccessTokenByUserId(
  db: AppDb,
  userId: string,
): string | null {
  const row = db
    .select({
      accessTokenEncrypted: githubCredentials.accessTokenEncrypted,
    })
    .from(githubCredentials)
    .innerJoin(
      githubAccounts,
      and(
        eq(githubAccounts.id, githubCredentials.githubAccountId),
        eq(githubAccounts.userId, userId),
      ),
    )
    .get();

  return row?.accessTokenEncrypted ?? null;
}

export function upsertClaudeCredentialByUserId(
  db: AppDb,
  userId: string,
  tokenEncrypted: string,
): void {
  db.transaction((tx) => {
    const now = new Date().toISOString();
    const existing = tx
      .select()
      .from(claudeCredentials)
      .where(eq(claudeCredentials.userId, userId))
      .get();

    if (existing) {
      tx.update(claudeCredentials)
        .set({
          tokenEncrypted,
          updatedAt: now,
        })
        .where(eq(claudeCredentials.id, existing.id))
        .run();
      return;
    }

    tx.insert(claudeCredentials)
      .values({
        id: `clc_${randomUUID().replaceAll("-", "")}`,
        userId,
        tokenEncrypted,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  });
}

export function getEncryptedClaudeTokenByUserId(
  db: AppDb,
  userId: string,
): string | null {
  const row = db
    .select({
      tokenEncrypted: claudeCredentials.tokenEncrypted,
    })
    .from(claudeCredentials)
    .where(eq(claudeCredentials.userId, userId))
    .get();

  return row?.tokenEncrypted ?? null;
}

export function hasClaudeCredentialByUserId(
  db: AppDb,
  userId: string,
): boolean {
  const row = db
    .select({
      id: claudeCredentials.id,
    })
    .from(claudeCredentials)
    .where(eq(claudeCredentials.userId, userId))
    .get();

  return row !== undefined;
}
