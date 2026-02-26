/**
 * Chat SDK bot instance for Slack integration.
 *
 * Handles incoming Slack events (mentions, thread replies) and bridges
 * them to the existing agent chat service layer.
 *
 * Approval button actions are handled separately in actions.ts / the
 * webhook route to avoid relying on Chat SDK background processing.
 */

import { Chat, type Message } from "chat";
import { createSlackAdapter } from "@chat-adapter/slack";
import { createRedisState } from "@chat-adapter/state-redis";
import { getDb } from "@/server/db";
import { getEnv } from "@/server/env";
import { createSession } from "@/server/sessions/service";
import { sendSessionClaudeChatMessage } from "@/server/sessions/claude-chat-service";
import {
  getSlackThreadSession,
  createSlackThreadSession,
  resolveUserIdFromSlackUser,
  createLinkToken,
} from "@/server/slack/store";
import { postEphemeralMessage } from "@/server/slack/notifier";

// ---------------------------------------------------------------------------
// Slack raw event types (subset used for extracting platform-specific data)
// ---------------------------------------------------------------------------

type SlackRawEvent = {
  channel?: string;
  team?: string;
  ts?: string;
  thread_ts?: string;
};

function getSlackRaw(message: Message): SlackRawEvent {
  return (message.raw ?? {}) as SlackRawEvent;
}

// ---------------------------------------------------------------------------
// Bot singleton — initialised lazily on first access.
// ---------------------------------------------------------------------------

type BotAdapters = { slack: ReturnType<typeof createSlackAdapter> };

let _bot: Chat<BotAdapters> | null = null;

export function getBot(): Chat<BotAdapters> {
  if (_bot) return _bot;

  const env = getEnv();

  _bot = new Chat<BotAdapters>({
    userName: "coding-agent",
    adapters: {
      slack: createSlackAdapter({
        botToken: env.SLACK_BOT_TOKEN,
        signingSecret: env.SLACK_SIGNING_SECRET,
      }),
    },
    state: createRedisState({ url: env.REDIS_URL }),
  });

  _bot.registerSingleton();
  registerHandlers(_bot);

  return _bot;
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

function registerHandlers(bot: Chat<BotAdapters>) {
  // ---- New mention: create session and start agent ----
  bot.onNewMention(async (thread, message) => {
    const slackRaw = getSlackRaw(message);
    const slackUserId = message.author.userId;
    const slackTeamId = slackRaw.team;
    const channelId = slackRaw.channel;

    if (!slackUserId || !slackTeamId || !channelId) {
      await thread.post("Could not resolve Slack user or channel information.");
      return;
    }

    const db = getDb();
    const ownerUserId = resolveUserIdFromSlackUser(db, slackUserId, slackTeamId);

    if (!ownerUserId) {
      const env = getEnv();
      const token = createLinkToken(db, slackUserId, slackTeamId);
      const baseUrl =
        env.SLACK_LINK_BASE_URL ??
        env.GITHUB_OAUTH_CALLBACK_URL.replace(
          /\/api\/auth\/github\/callback$/,
          "",
        );
      const linkUrl = `${baseUrl}/api/slack/link?token=${token}`;

      await postEphemeralMessage(
        channelId,
        slackUserId,
        `Your Slack account is not linked yet. Please visit the following URL while logged in to link your account:\n${linkUrl}`,
      );
      return;
    }

    await thread.subscribe();

    const prompt = message.text?.trim() ?? "";
    if (!prompt) {
      await thread.post("Please provide a prompt for the agent.");
      return;
    }

    await thread.post(":hourglass_flowing_sand: Creating session...");

    try {
      const session = await createSession(db, ownerUserId, {});

      // The thread_ts for replies. When mentioning in a channel (not a thread),
      // the ts of the original message becomes the thread_ts for replies.
      const threadTs = slackRaw.thread_ts ?? slackRaw.ts ?? "";

      createSlackThreadSession(db, {
        slackTeamId,
        slackChannelId: channelId,
        slackThreadTs: threadTs,
        sessionId: session.id,
        ownerUserId,
      });

      await thread.post(
        `Session \`${session.id}\` created. Sending prompt to agent...`,
      );

      await sendSessionClaudeChatMessage(db, ownerUserId, session.id, {
        prompt,
      });
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Unknown error occurred";
      await thread.post(`:x: Failed to start session: ${msg}`);
    }
  });

  // ---- Follow-up message in subscribed thread ----
  bot.onSubscribedMessage(async (thread, message) => {
    const slackRaw = getSlackRaw(message);
    const slackUserId = message.author.userId;
    const slackTeamId = slackRaw.team;
    const channelId = slackRaw.channel;
    const threadTs = slackRaw.thread_ts;

    if (!slackUserId || !slackTeamId || !channelId || !threadTs) return;

    const db = getDb();
    const ownerUserId = resolveUserIdFromSlackUser(
      db,
      slackUserId,
      slackTeamId,
    );
    if (!ownerUserId) return;

    const mapping = getSlackThreadSession(
      db,
      slackTeamId,
      channelId,
      threadTs,
    );
    if (!mapping) return;

    const prompt = message.text?.trim() ?? "";
    if (!prompt) return;

    try {
      await sendSessionClaudeChatMessage(db, ownerUserId, mapping.sessionId, {
        prompt,
      });
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Unknown error occurred";
      await thread.post(`:x: ${msg}`);
    }
  });

  // Approval button actions (slack_approve / slack_deny) are handled directly
  // in the webhook route (see actions.ts) to avoid relying on Chat SDK's
  // background task processing via waitUntil / after().
}
