import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireAuthenticatedUser } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { jsonError } from "@/server/http";
import {
  getSessionClaudeChat,
  sendSessionClaudeChatMessage,
} from "@/server/sessions/claude-chat-service";
import { SessionError } from "@/server/sessions/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

const sendSchema = z.object({
  prompt: z.string().min(1),
  cwd: z.string().optional(),
  maxTurns: z.number().int().min(1).max(20).optional(),
});

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const db = getDb();

  try {
    const user = requireAuthenticatedUser(db, request);
    const body = await getSessionClaudeChat(db, user.id, id);
    return NextResponse.json(body);
  } catch (error) {
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

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const db = getDb();

  try {
    const user = requireAuthenticatedUser(db, request);
    const input = sendSchema.parse(await request.json());
    const body = await sendSessionClaudeChatMessage(db, user.id, id, input);
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
      500,
      error instanceof Error ? error.message : "Internal error",
    );
  }
}
