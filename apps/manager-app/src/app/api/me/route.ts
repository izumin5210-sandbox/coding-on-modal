import { NextResponse } from "next/server";
import type { MeResponse } from "@/lib/auth-types";
import { AuthError, requireAuthenticatedUser } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { jsonError } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const db = getDb();

  try {
    const user = requireAuthenticatedUser(db, request);
    const body: MeResponse = { user };
    return NextResponse.json(body);
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonError(error.statusCode, error.message);
    }

    return jsonError(
      500,
      error instanceof Error ? error.message : "Internal error",
    );
  }
}
