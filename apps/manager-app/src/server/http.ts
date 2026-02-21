import { NextResponse } from "next/server";

export function jsonError(status: number, message: string) {
  return NextResponse.json(
    {
      error: {
        code: status,
        message,
      },
    },
    { status },
  );
}
