import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import {
  type BetterSQLite3Database,
  drizzle,
} from "drizzle-orm/better-sqlite3";
import { getEnv } from "@/server/env";
import * as schema from "./schema";

export type AppDb = BetterSQLite3Database<typeof schema>;

type GlobalDbCache = typeof globalThis & {
  __managerAppDb?: AppDb;
};

const globalDb = globalThis as GlobalDbCache;

function createDb(): AppDb {
  const env = getEnv();
  const dir = path.dirname(env.SESSION_DB_PATH);
  mkdirSync(dir, { recursive: true });

  const sqlite = new Database(env.SESSION_DB_PATH);
  sqlite.pragma("journal_mode = WAL");

  return drizzle({ client: sqlite, schema });
}

export function getDb(): AppDb {
  if (!globalDb.__managerAppDb) {
    globalDb.__managerAppDb = createDb();
  }

  return globalDb.__managerAppDb;
}
