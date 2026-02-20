import { NextResponse } from "next/server";
import { jsonError } from "@/server/http";
import {
  deleteSessionRecord,
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

export async function GET(_: Request, { params }: Params) {
  const { id } = await params;
  try {
    const session = await getSessionRecord(id);
    return NextResponse.json({ session });
  } catch (error) {
    if (error instanceof SessionError) {
      return jsonError(error.statusCode, error.message);
    }
    return jsonError(
      500,
      error instanceof Error ? error.message : "Internal error",
    );
  }
}

export async function DELETE(_: Request, { params }: Params) {
  const { id } = await params;
  try {
    const deleted = await deleteSessionRecord(id);
    if (!deleted) {
      return jsonError(404, `Session not found: ${id}`);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(
      500,
      error instanceof Error ? error.message : "Internal error",
    );
  }
}
