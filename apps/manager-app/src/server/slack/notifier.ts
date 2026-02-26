/**
 * Posts messages to Slack threads from the workflow context.
 *
 * Uses the Slack Web API directly via fetch (no extra dependencies) so that
 * it can be called from durable workflow steps without requiring the Chat SDK
 * bot singleton.
 *
 * Works with raw SDKMessage[] (the format available in the workflow) rather
 * than the fully-normalized SessionChatMessage[] to avoid a circular
 * dependency on claude-chat-service.
 */

import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { getEnv } from "@/server/env";

// ---------------------------------------------------------------------------
// Low-level Slack API helpers
// ---------------------------------------------------------------------------

type SlackPostResult = {
  ok: boolean;
  error?: string;
  ts?: string;
};

function getSlackBotToken(): string {
  return getEnv().SLACK_BOT_TOKEN;
}

async function slackPostMessage(
  channel: string,
  threadTs: string,
  text: string,
  blocks?: unknown[],
): Promise<SlackPostResult> {
  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${getSlackBotToken()}`,
    },
    body: JSON.stringify({
      channel,
      thread_ts: threadTs,
      text,
      ...(blocks ? { blocks } : {}),
      mrkdwn: true,
    }),
  });
  return (await response.json()) as SlackPostResult;
}

// ---------------------------------------------------------------------------
// SDK message → Slack text extraction
// ---------------------------------------------------------------------------

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}… (truncated)`;
}

/**
 * Extracts Slack-postable text from raw SDK messages.
 * Only renders content that is meaningful in Slack — skips internal events,
 * tool progress, stream events, etc.
 */
function extractSlackTextFromSdkMessages(messages: SDKMessage[]): string | null {
  const chunks: string[] = [];

  for (const message of messages) {
    if (message.type === "assistant") {
      const content = message.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (
            typeof block === "object" &&
            block !== null &&
            "type" in block &&
            block.type === "text" &&
            "text" in block &&
            typeof block.text === "string" &&
            block.text.trim()
          ) {
            chunks.push(block.text.trim());
          }
        }
      }
    }

    if (message.type === "result") {
      const icon = message.is_error ? ":x:" : ":white_check_mark:";
      const summary =
        message.subtype === "success"
          ? message.result || "Completed successfully."
          : message.errors?.join("\n") || "Completed with an error.";
      const lines = [`${icon} ${summary}`];

      const meta: string[] = [];
      if (message.num_turns != null) meta.push(`${message.num_turns} turns`);
      if (message.duration_ms != null)
        meta.push(`${(message.duration_ms / 1000).toFixed(1)}s`);
      if (message.total_cost_usd != null)
        meta.push(`$${message.total_cost_usd.toFixed(4)}`);
      if (meta.length > 0) lines.push(`_${meta.join(" · ")}_`);

      chunks.push(lines.join("\n"));
    }
  }

  return chunks.length > 0 ? chunks.join("\n\n") : null;
}

/**
 * Extracts pending-input info from a permission_request event.
 */
function formatPendingInfoForSlack(
  pendingInfo: Record<string, unknown>,
): string {
  const toolName =
    typeof pendingInfo.toolName === "string"
      ? pendingInfo.toolName
      : "unknown tool";
  const kind = pendingInfo.kind as string | undefined;
  const decisionReason =
    typeof pendingInfo.decisionReason === "string"
      ? pendingInfo.decisionReason
      : undefined;

  if (kind === "ask-user-question" && Array.isArray(pendingInfo.questions)) {
    const lines = ["*The agent has a question:*"];
    for (const q of pendingInfo.questions as Array<{
      header?: string;
      question?: string;
    }>) {
      if (q.header) lines.push(`> *${q.header}*`);
      if (q.question) lines.push(`> ${q.question}`);
    }
    return lines.join("\n");
  }

  const lines = [`*Tool approval required: \`${toolName}\`*`];
  if (decisionReason) lines.push(decisionReason);
  if (pendingInfo.input) {
    lines.push(
      `\`\`\`\n${truncate(JSON.stringify(pendingInfo.input, null, 2), 1500)}\n\`\`\``,
    );
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Public API — called from workflow steps
// ---------------------------------------------------------------------------

/**
 * Posts newly-accumulated SDK messages to a Slack thread.
 */
export async function postSdkMessagesToSlack(
  channelId: string,
  threadTs: string,
  messages: SDKMessage[],
): Promise<void> {
  const text = extractSlackTextFromSdkMessages(messages);
  if (!text) return;

  const result = await slackPostMessage(channelId, threadTs, text);
  if (!result.ok) {
    console.error(`[slack-notifier] chat.postMessage failed: ${result.error}`);
  }
}

/**
 * Posts a pending-input prompt (approval/question card) to Slack.
 */
export async function postPendingInputToSlack(
  channelId: string,
  threadTs: string,
  pendingInfo: Record<string, unknown>,
  sessionId: string,
): Promise<void> {
  const text = formatPendingInfoForSlack(pendingInfo);

  const actionPayload = JSON.stringify({
    sessionId,
    toolUseId: pendingInfo.toolUseId,
    kind: pendingInfo.kind,
  });

  const blocks = [
    {
      type: "section",
      text: { type: "mrkdwn", text },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Allow" },
          style: "primary",
          action_id: "slack_approve",
          value: actionPayload,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Deny" },
          style: "danger",
          action_id: "slack_deny",
          value: actionPayload,
        },
      ],
    },
  ];

  const result = await slackPostMessage(
    channelId,
    threadTs,
    `Approval required: ${typeof pendingInfo.toolName === "string" ? pendingInfo.toolName : "tool"}`,
    blocks,
  );
  if (!result.ok) {
    console.error(
      `[slack-notifier] pending-input postMessage failed: ${result.error}`,
    );
  }
}

/**
 * Sends an ephemeral message visible only to a specific user.
 */
export async function postEphemeralMessage(
  channelId: string,
  userId: string,
  text: string,
): Promise<void> {
  const response = await fetch("https://slack.com/api/chat.postEphemeral", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${getSlackBotToken()}`,
    },
    body: JSON.stringify({ channel: channelId, user: userId, text }),
  });

  const result = (await response.json()) as { ok: boolean; error?: string };
  if (!result.ok) {
    console.error(
      `[slack-notifier] chat.postEphemeral failed: ${result.error}`,
    );
  }
}
