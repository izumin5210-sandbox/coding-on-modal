import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { getEnv } from "@/server/env";

let db: Database.Database | null = null;

function init(dbInstance: Database.Database): void {
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      provider_session_id TEXT NOT NULL,
      name TEXT NOT NULL,
      repo_url TEXT NOT NULL,
      repo_ref TEXT NOT NULL,
      status TEXT NOT NULL,
      workspace_path TEXT NOT NULL,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_updated_at
      ON sessions(updated_at DESC);
  `);
}

export function getDb(): Database.Database {
  if (db) {
    return db;
  }

  const env = getEnv();
  const dir = path.dirname(env.SESSION_DB_PATH);
  mkdirSync(dir, { recursive: true });
  db = new Database(env.SESSION_DB_PATH);
  db.pragma("journal_mode = WAL");
  init(db);
  return db;
}
