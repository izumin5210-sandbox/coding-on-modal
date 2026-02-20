import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { SessionStatus } from "@/lib/session-types";

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
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
  (table) => [index("idx_sessions_updated_at").on(table.updatedAt)],
);

export type SessionRow = typeof sessions.$inferSelect;
