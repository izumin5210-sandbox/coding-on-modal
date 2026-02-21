import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { SessionStatus } from "@/lib/session-types";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const githubAccounts = sqliteTable(
  "github_accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    githubUserId: text("github_user_id").notNull(),
    login: text("login").notNull(),
    name: text("name"),
    email: text("email"),
    avatarUrl: text("avatar_url"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uidx_github_accounts_user_id").on(table.userId),
    uniqueIndex("uidx_github_accounts_github_user_id").on(table.githubUserId),
  ],
);

export const githubCredentials = sqliteTable(
  "github_credentials",
  {
    id: text("id").primaryKey(),
    githubAccountId: text("github_account_id")
      .notNull()
      .references(() => githubAccounts.id, { onDelete: "cascade" }),
    accessTokenEncrypted: text("access_token_encrypted").notNull(),
    refreshTokenEncrypted: text("refresh_token_encrypted"),
    tokenType: text("token_type").notNull(),
    scope: text("scope"),
    expiresAt: text("expires_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uidx_github_credentials_account_id").on(table.githubAccountId),
  ],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerSessionId: text("provider_session_id").notNull(),
    name: text("name").notNull(),
    repoUrl: text("repo_url").notNull(),
    repoRef: text("repo_ref").notNull(),
    status: text("status").$type<SessionStatus>().notNull(),
    workspacePath: text("workspace_path").notNull(),
    lastError: text("last_error"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_sessions_owner_user_id").on(table.ownerUserId),
    index("idx_sessions_updated_at").on(table.updatedAt),
  ],
);

export type SessionRow = typeof sessions.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type GithubAccountRow = typeof githubAccounts.$inferSelect;
export type GithubCredentialRow = typeof githubCredentials.$inferSelect;
