import type { AuthUser } from "@/lib/auth-types";
import { getAuthenticatedUser } from "@/server/auth/session";
import { type AppDb, getDb } from "@/server/db";

export type GraphQLContext = {
  db: AppDb;
  request: Request;
  viewer: AuthUser | null;
};

export function createGraphQLContext(request: Request): GraphQLContext {
  const db = getDb();

  return {
    db,
    request,
    viewer: getAuthenticatedUser(db, request),
  };
}
