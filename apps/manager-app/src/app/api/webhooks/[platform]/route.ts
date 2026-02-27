import { after } from "next/server";
import { getBot } from "@/server/slack/bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ platform: string }> };

export async function POST(request: Request, { params }: Params) {
  const { platform } = await params;
  const bot = getBot();
  const handler = bot.webhooks[platform as keyof typeof bot.webhooks];
  if (!handler) {
    return new Response(`Unknown platform: ${platform}`, { status: 404 });
  }
  return handler(request, {
    waitUntil: (task: Promise<unknown>) => after(() => task),
  });
}
