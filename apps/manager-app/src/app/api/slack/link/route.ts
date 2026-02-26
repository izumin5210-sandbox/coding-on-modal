import { NextResponse } from "next/server";
import { AuthError, requireAuthenticatedUser } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { jsonError } from "@/server/http";
import {
  consumeLinkToken,
  upsertSlackUserMapping,
} from "@/server/slack/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/slack/link?token=<uuid>
 *
 * Called when a user clicks the link URL sent by the bot in Slack.
 * Consumes the one-time token and creates a Slack ↔ app user mapping.
 * The user must be authenticated via the existing GitHub OAuth session.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return jsonError(400, "Missing token parameter");
  }

  const db = getDb();

  let user;
  try {
    user = requireAuthenticatedUser(db, request);
  } catch (error) {
    if (error instanceof AuthError) {
      // Redirect to login with return URL
      const returnUrl = encodeURIComponent(request.url);
      return NextResponse.redirect(
        new URL(`/?returnTo=${returnUrl}`, url.origin),
      );
    }
    throw error;
  }

  const result = consumeLinkToken(db, token);
  if (!result) {
    return jsonError(400, "Invalid or expired link token");
  }

  upsertSlackUserMapping(db, {
    slackUserId: result.slackUserId,
    slackTeamId: result.slackTeamId,
    userId: user.id,
  });

  return new Response(
    `<html><body>
      <h2>Account linked successfully</h2>
      <p>Your Slack account has been linked. You can close this page and return to Slack.</p>
    </body></html>`,
    {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    },
  );
}
