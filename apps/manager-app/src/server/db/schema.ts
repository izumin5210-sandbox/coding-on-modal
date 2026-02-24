import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
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

export const claudeCredentials = sqliteTable(
  "claude_credentials",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenEncrypted: text("token_encrypted").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("uidx_claude_credentials_user_id").on(table.userId)],
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

export const sessionClaudeCodeThreads = sqliteTable(
  "session_claude_code_threads",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    claudeSdkSessionId: text("claude_sdk_session_id"),
    cwd: text("cwd").notNull(),
    maxTurns: integer("max_turns").notNull(),
    isRunning: integer("is_running", { mode: "boolean" })
      .notNull()
      .default(false),
    lastError: text("last_error"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uidx_session_claude_code_threads_session_id").on(
      table.sessionId,
    ),
    index("idx_session_claude_code_threads_updated_at").on(table.updatedAt),
  ],
);

export const sessionClaudeCodeMessages = sqliteTable(
  "session_claude_code_messages",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => sessionClaudeCodeThreads.id, { onDelete: "cascade" }),
    sdkMessageJson: text("sdk_message_json").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_session_claude_code_messages_thread_id").on(table.threadId),
    index("idx_session_claude_code_messages_thread_id_created_at").on(
      table.threadId,
      table.createdAt,
    ),
  ],
);

export type SessionRow = typeof sessions.$inferSelect;
export type SessionClaudeCodeThreadRow =
  typeof sessionClaudeCodeThreads.$inferSelect;
export type SessionClaudeCodeMessageRow =
  typeof sessionClaudeCodeMessages.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type GithubAccountRow = typeof githubAccounts.$inferSelect;
export type GithubCredentialRow = typeof githubCredentials.$inferSelect;
export type ClaudeCredentialRow = typeof claudeCredentials.$inferSelect;
