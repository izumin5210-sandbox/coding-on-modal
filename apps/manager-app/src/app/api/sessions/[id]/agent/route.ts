import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/server/db";
import { jsonError } from "@/server/http";
import { runAgentInSession, SessionError } from "@/server/sessions/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

const agentSchema = z.object({
  prompt: z.string().min(1),
  cwd: z.string().optional(),
  maxTurns: z.number().int().min(1).max(20).optional(),
});

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const db = getDb();

  try {
    const input = agentSchema.parse(await request.json());
    const result = await runAgentInSession(db, id, input);
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

    return jsonError(
      500,
      error instanceof Error ? error.message : "Internal error",
    );
  }
}
