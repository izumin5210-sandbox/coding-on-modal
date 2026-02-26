/**
 * Handles Slack block_actions for approval buttons (Allow / Deny).
 *
 * Called directly from the webhook route — NOT through the Chat SDK's
 * onAction mechanism — so that the processing is awaited inline rather
 * than delegated to a background task via waitUntil / after().
 */

import { getDb } from "@/server/db";
import { getEnv } from "@/server/env";
import { submitSessionClaudeChatUserInput } from "@/server/sessions/claude-chat-service";
import { getSlackThreadSessionBySessionId } from "@/server/slack/store";

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function handleSlackBlockAction(
  actionId: string,
  value: string | undefined,
  channelId: string,
  threadTs: string,
): Promise<void> {
  const behavior: "allow" | "deny" =
    actionId === "slack_approve" ? "allow" : "deny";

  if (!value) return;

  let payload: { sessionId: string; toolUseId: string };
  try {
    payload = JSON.parse(value);
  } catch {
    return;
  }

  const db = getDb();
  const mapping = getSlackThreadSessionBySessionId(db, payload.sessionId);
  if (!mapping) return;

  await submitSessionClaudeChatUserInput(
    db,
    mapping.ownerUserId,
    payload.sessionId,
    { toolUseId: payload.toolUseId, behavior },
  );

  // Post confirmation to the Slack thread via raw API (avoids depending on
  // a Chat SDK thread instance that may not be available at this point).
  const label =
    behavior === "allow"
      ? ":white_check_mark: Allowed"
      : ":no_entry: Denied";

  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${getEnv().SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify({
      channel: channelId,
      thread_ts: threadTs,
      text: `${label} tool \`${payload.toolUseId}\``,
    }),
  });

  const result = (await response.json()) as { ok: boolean; error?: string };
  if (!result.ok) {
    console.error(
      `[slack-actions] chat.postMessage failed: ${result.error}`,
    );
  }
}
