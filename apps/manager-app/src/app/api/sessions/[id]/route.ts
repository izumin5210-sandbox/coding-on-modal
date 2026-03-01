import { NextResponse } from "next/server";
import { AuthError, requireAuthenticatedUser } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { jsonError } from "@/server/http";
import {
  getSessionRecord,
  SessionError,
} from "@/server/sessions/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const db = getDb();
  try {
    const user = requireAuthenticatedUser(db, request);
    const session = await getSessionRecord(db, user.id, id);
    return NextResponse.json({ session });
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonError(error.statusCode, error.message);
    }
    if (error instanceof SessionError) {
      return jsonError(error.statusCode, error.message);
    }
    return jsonError(
      500,
      error instanceof Error ? error.message : "Internal error",
    );
  }
}

