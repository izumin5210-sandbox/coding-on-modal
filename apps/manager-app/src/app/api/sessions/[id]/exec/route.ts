import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireAuthenticatedUser } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { jsonError } from "@/server/http";
import { executeInSession, SessionError } from "@/server/sessions/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

const execSchema = z.object({
  cmd: z.string().min(1),
  cwd: z.string().optional(),
  pty: z.boolean().optional(),
});

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const db = getDb();

  try {
    const user = requireAuthenticatedUser(db, request);
    const input = execSchema.parse(await request.json());
    const result = await executeInSession(db, user.id, id, input);
    return NextResponse.json({ result });
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
