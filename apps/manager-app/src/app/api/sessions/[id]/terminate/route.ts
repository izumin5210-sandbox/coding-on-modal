import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { jsonError } from "@/server/http";
import {
  SessionError,
  terminateSessionRecord,
} from "@/server/sessions/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_: Request, { params }: Params) {
  const { id } = await params;
  const db = getDb();

  try {
    const session = await terminateSessionRecord(db, id);
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
