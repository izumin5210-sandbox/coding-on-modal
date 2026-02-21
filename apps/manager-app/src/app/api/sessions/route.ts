import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireAuthenticatedUser } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { jsonError } from "@/server/http";
import {
  createSession,
  listSessionRecords,
  SessionError,
} from "@/server/sessions/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  repoUrl: z.string().url().optional(),
  repoRef: z.string().trim().min(1).max(120).optional(),
});

export async function GET(request: Request) {
  const db = getDb();
  try {
    const user = requireAuthenticatedUser(db, request);
    const sessions = await listSessionRecords(db, user.id);
    return NextResponse.json({ sessions });
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

export async function POST(request: Request) {
  const db = getDb();
  try {
    const user = requireAuthenticatedUser(db, request);
    const input = createSchema.parse(await request.json());
    const session = await createSession(db, user.id, input);
    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(
        400,
        error.issues.map((issue) => issue.message).join(", "),
      );
    }
    if (error instanceof SessionError) {
      return jsonError(error.statusCode, error.message);
    }
    if (error instanceof AuthError) {
      return jsonError(error.statusCode, error.message);
    }

    return jsonError(
      500,
      error instanceof Error ? error.message : "Internal error",
    );
  }
}
