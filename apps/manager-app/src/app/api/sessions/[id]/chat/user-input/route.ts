import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireAuthenticatedUser } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { jsonError } from "@/server/http";
import { submitSessionClaudeChatUserInput } from "@/server/sessions/claude-chat-service";
import { SessionError } from "@/server/sessions/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

const submitSchema = z.object({
  requestId: z.string().min(1),
  behavior: z.enum(["allow", "deny"]),
  message: z.string().optional(),
  answers: z
    .record(z.string(), z.union([z.string(), z.array(z.string())]))
    .optional(),
});

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const db = getDb();

  try {
    const user = requireAuthenticatedUser(db, request);
    const input = submitSchema.parse(await request.json());
    const body = await submitSessionClaudeChatUserInput(db, user.id, id, input);
    return NextResponse.json(body);
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
      409,
      error instanceof Error ? error.message : "Unable to submit user input",
    );
  }
}
