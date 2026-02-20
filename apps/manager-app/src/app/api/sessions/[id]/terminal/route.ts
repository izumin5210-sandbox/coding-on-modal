import { NextResponse } from "next/server";
import { jsonError } from "@/server/http";
import { openSessionTerminal, SessionError } from "@/server/sessions/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_: Request, { params }: Params) {
  const { id } = await params;

  try {
    const session = await openSessionTerminal(id);
    return NextResponse.json({
      session,
      terminalUrl: session.terminalUrl,
    });
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
