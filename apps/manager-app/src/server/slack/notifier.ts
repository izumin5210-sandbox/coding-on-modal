/**
 * Posts messages to Slack threads from the workflow context.
 *
 * Uses the Chat SDK Slack adapter for all outgoing messages, keeping
 * Slack API access centralised through a single abstraction layer.
 *
 * Works with raw SDKMessage[] (the format available in the workflow) rather
 * than the fully-normalized SessionChatMessage[] to avoid a circular
 * dependency on claude-chat-service.
 */

import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { Actions, Button, Card, CardText } from "chat";
import { getBot } from "@/server/slack/bot";

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
function extractSlackTextFromSdkMessages(
  messages: SDKMessage[],
): string | null {
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
// Adapter helper
// ---------------------------------------------------------------------------

function getSlackAdapter() {
  const bot = getBot();
  return bot.getAdapter("slack");
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

  const adapter = getSlackAdapter();
  const threadId = adapter.encodeThreadId({ channel: channelId, threadTs });
  await adapter.postMessage(threadId, { markdown: text });
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

  const card = Card({
    children: [
      CardText(text),
      Actions([
        Button({
          id: "slack_approve",
          label: "Allow",
          style: "primary",
          value: actionPayload,
        }),
        Button({
          id: "slack_deny",
          label: "Deny",
          style: "danger",
          value: actionPayload,
        }),
      ]),
    ],
  });

  const adapter = getSlackAdapter();
  const threadId = adapter.encodeThreadId({ channel: channelId, threadTs });
  const fallbackText = `Approval required: ${typeof pendingInfo.toolName === "string" ? pendingInfo.toolName : "tool"}`;
  await adapter.postMessage(threadId, { card, fallbackText });
}
