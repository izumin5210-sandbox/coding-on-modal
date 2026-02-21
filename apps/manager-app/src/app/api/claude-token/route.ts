import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireAuthenticatedUser } from "@/server/auth/session";
import { encryptToken } from "@/server/crypto/token";
import { getDb } from "@/server/db";
import { jsonError } from "@/server/http";
import { upsertClaudeCredentialByUserId } from "@/server/users/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const saveClaudeTokenSchema = z.object({
  token: z.string().trim().min(1, "token is required"),
});

export async function POST(request: Request) {
  const db = getDb();

  try {
    const user = requireAuthenticatedUser(db, request);
    const input = saveClaudeTokenSchema.parse(await request.json());
    upsertClaudeCredentialByUserId(db, user.id, encryptToken(input.token));
    return NextResponse.json({ claudeTokenConfigured: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(
        400,
        error.issues.map((issue) => issue.message).join(", "),
      );
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
