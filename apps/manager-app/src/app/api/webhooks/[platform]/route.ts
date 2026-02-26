import { createHmac, timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { getBot } from "@/server/slack/bot";
import { handleSlackBlockAction } from "@/server/slack/actions";
import { getEnv } from "@/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ platform: string }>;
};

// ---------------------------------------------------------------------------
// Slack signature verification (duplicated from adapter to allow intercepting
// interactive payloads before they reach the Chat SDK).
// ---------------------------------------------------------------------------

function verifySlackSignature(
  body: string,
  timestamp: string | null,
  signature: string | null,
): boolean {
  if (!timestamp || !signature) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number.parseInt(timestamp, 10)) > 300) return false;
  const baseString = `v0:${timestamp}:${body}`;
  const expected =
    "v0=" +
    createHmac("sha256", getEnv().SLACK_SIGNING_SECRET)
      .update(baseString)
      .digest("hex");
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Try to intercept Slack block_actions we own (approval buttons).
// Returns a Response if handled, null otherwise.
// ---------------------------------------------------------------------------

type SlackBlockActionsPayload = {
  type: "block_actions";
  channel?: { id?: string };
  message?: { ts?: string; thread_ts?: string };
  user?: { id?: string };
  actions?: Array<{ action_id: string; value?: string }>;
};

async function tryHandleSlackInteraction(
  body: string,
  timestamp: string | null,
  signature: string | null,
): Promise<Response | null> {
  if (!verifySlackSignature(body, timestamp, signature)) {
    return new Response("Invalid signature", { status: 401 });
  }

  const formParams = new URLSearchParams(body);
  const payloadStr = formParams.get("payload");
  if (!payloadStr) return null;

  let payload: SlackBlockActionsPayload;
  try {
    payload = JSON.parse(payloadStr) as SlackBlockActionsPayload;
  } catch {
    return null;
  }

  if (payload.type !== "block_actions" || !Array.isArray(payload.actions)) {
    return null;
  }

  const action = payload.actions.find(
    (a) => a.action_id === "slack_approve" || a.action_id === "slack_deny",
  );
  if (!action) return null;

  const channelId = payload.channel?.id;
  const threadTs = payload.message?.thread_ts ?? payload.message?.ts;

  if (channelId && threadTs) {
    try {
      await handleSlackBlockAction(action.action_id, action.value, channelId, threadTs);
    } catch (error) {
      console.error("[slack-webhook] Approval action failed:", error);
    }
  }

  return new Response("", { status: 200 });
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: Request, { params }: Params) {
  const { platform } = await params;

  if (platform === "slack") {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const body = await request.text();
      const timestamp = request.headers.get("x-slack-request-timestamp");
      const signature = request.headers.get("x-slack-signature");

      const handled = await tryHandleSlackInteraction(
        body,
        timestamp,
        signature,
      );
      if (handled) return handled;

      // Not our action — reconstruct the request and delegate to Chat SDK.
      // The body was already consumed so we must create a new Request.
      const bot = getBot();
      return bot.webhooks.slack(
        new Request(request.url, {
          method: request.method,
          headers: request.headers,
          body,
        }),
        { waitUntil: (task: Promise<unknown>) => after(() => task) },
      );
    }
  }

  const bot = getBot();
  const handler = bot.webhooks[platform as keyof typeof bot.webhooks];
  if (!handler) {
    return new Response(`Unknown platform: ${platform}`, { status: 404 });
  }

  return handler(request, {
    waitUntil: (task: Promise<unknown>) => after(() => task),
  });
}
