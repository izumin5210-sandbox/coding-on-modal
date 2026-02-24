import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireAuthenticatedUser } from "@/server/auth/session";
import { encryptToken } from "@/server/crypto/token";
import { getDb } from "@/server/db";
import { jsonError } from "@/server/http";
import { upsertClaudeCredentialByUserId } from "@/server/users/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const saveClaudeApiKeySchema = z
  .object({
    apiKey: z.string().trim().optional(),
    token: z.string().trim().optional(),
  })
  .superRefine((value, ctx) => {
    if ((value.apiKey && value.apiKey.length > 0) || value.token) {
      return;
    }
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "apiKey is required",
    });
  });

export async function POST(request: Request) {
  const db = getDb();

  try {
    const user = requireAuthenticatedUser(db, request);
    const input = saveClaudeApiKeySchema.parse(await request.json());
    const apiKey =
      input.apiKey && input.apiKey.length > 0 ? input.apiKey : input.token;
    if (!apiKey) {
      return jsonError(400, "apiKey is required");
    }
    upsertClaudeCredentialByUserId(db, user.id, encryptToken(apiKey));
    return NextResponse.json({ claudeApiKeyConfigured: true });
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
