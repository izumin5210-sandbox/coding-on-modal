import SessionChatPageClient from "./session-chat-page-client";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function SessionChatPage({ params }: Props) {
  const { id } = await params;
  return <SessionChatPageClient sessionId={id} />;
}
