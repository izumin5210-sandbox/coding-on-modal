"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  GetSessionChatResponse,
  SendSessionChatMessageResponse,
  SessionChatUiMessage,
} from "@/lib/session-chat-types";

type ApiError = {
  error?: {
    message?: string;
  };
};

function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

async function parseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as ApiError | null;
  return body?.error?.message ?? `Request failed (${response.status})`;
}

function StatusBadge({ status }: { status: string }) {
  const className =
    status === "running"
      ? "bg-emerald-100 text-emerald-800"
      : status === "terminated"
        ? "bg-slate-200 text-slate-700"
        : status === "error"
          ? "bg-rose-100 text-rose-800"
          : "bg-amber-100 text-amber-800";

  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {status}
    </span>
  );
}

function MessageBubble({ message }: { message: SessionChatUiMessage }) {
  if (message.role === "system") {
    const toneClass =
      message.kind === "error"
        ? "border-rose-200 bg-rose-50 text-rose-900"
        : "border-slate-200 bg-white/80 text-slate-800";

    return (
      <div className={`rounded-xl border px-3 py-2 text-sm ${toneClass}`}>
        <div className="mb-1 flex items-center justify-between gap-3 text-xs text-slate-500">
          <span>
            {message.kind === "tool_summary"
              ? "Tool summary"
              : message.kind === "result"
                ? "Run result"
                : "System"}
          </span>
          <span>{formatTime(message.createdAt)}</span>
        </div>
        <pre className="whitespace-pre-wrap break-words font-sans text-sm">
          {message.content}
        </pre>
      </div>
    );
  }

  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
          isUser
            ? "bg-slate-900 text-white"
            : "border border-slate-200 bg-white text-slate-900"
        }`}
      >
        <div
          className={`mb-1 text-[11px] ${isUser ? "text-slate-300" : "text-slate-500"}`}
        >
          {isUser ? "You" : "Claude"} · {formatTime(message.createdAt)}
        </div>
        <pre className="whitespace-pre-wrap break-words font-sans text-sm">
          {message.content}
        </pre>
      </div>
    </div>
  );
}

export default function SessionChatPageClient({
  sessionId,
}: {
  sessionId: string;
}) {
  const [data, setData] = useState<GetSessionChatResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [cwd, setCwd] = useState("");
  const [maxTurns, setMaxTurns] = useState("8");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const loadChat = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/sessions/${sessionId}/chat`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(await parseError(response));
      }
      const body = (await response.json()) as GetSessionChatResponse;
      setData(body);
      setCwd(
        (current) => current || body.thread.cwd || body.session.workspacePath,
      );
      setMaxTurns((current) => current || String(body.thread.maxTurns || 8));
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : String(loadError),
      );
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || sending) {
      return;
    }

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setError("Prompt must not be empty.");
      return;
    }

    setSending(true);
    setError(null);
    setNotice(null);

    try {
      const maxTurnsNumber = Number(maxTurns);
      const response = await fetch(`/api/sessions/${sessionId}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: trimmedPrompt,
          cwd: cwd.trim() || undefined,
          maxTurns: Number.isFinite(maxTurnsNumber)
            ? Math.max(1, Math.min(20, Math.floor(maxTurnsNumber)))
            : undefined,
        }),
      });
      if (!response.ok) {
        throw new Error(await parseError(response));
      }

      const body = (await response.json()) as SendSessionChatMessageResponse;
      setData((current) => {
        if (!current) {
          return {
            session: body.session,
            thread: body.thread,
            messages: body.appendedMessages,
            rawCount: body.appendedMessages.length,
          };
        }
        return {
          session: body.session,
          thread: body.thread,
          messages: [...current.messages, ...body.appendedMessages],
          rawCount: current.rawCount + body.appendedRawCount,
        };
      });
      setPrompt("");
      if (body.run.isError) {
        setNotice(
          `Run finished with error${body.run.subtype ? ` (${body.run.subtype})` : ""}.`,
        );
      } else {
        setNotice("Run finished.");
      }
    } catch (sendError) {
      setError(
        sendError instanceof Error ? sendError.message : String(sendError),
      );
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    void loadChat();
  }, [loadChat]);

  useEffect(() => {
    const messageCount = data?.messages.length ?? 0;
    void messageCount;
    if (!scrollRef.current) {
      return;
    }
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [data?.messages.length]);

  const session = data?.session ?? null;
  const thread = data?.thread ?? null;
  const isSessionTerminated = session?.status === "terminated";
  const isThreadRunning = thread?.isRunning ?? false;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#e0f2fe,_transparent_45%),radial-gradient(circle_at_top_right,_#fde68a,_transparent_40%),#f8fafc] p-4 sm:p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <header className="rounded-3xl border border-slate-200/80 bg-white/85 p-5 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight text-slate-900">
                  Session Chat
                </h1>
                {session ? <StatusBadge status={session.status} /> : null}
              </div>
              {session ? (
                <div className="mt-2 space-y-1 text-sm text-slate-600">
                  <p className="font-medium text-slate-900">{session.name}</p>
                  <p>ID: {session.id}</p>
                  <p>Workspace: {session.workspacePath}</p>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-600">
                  {loading ? "Loading session..." : "Session data unavailable"}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
              >
                Back to Sessions
              </Link>
              <button
                type="button"
                onClick={() => {
                  void loadChat();
                }}
                disabled={loading || sending}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>

          {error ? (
            <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
              {notice}
            </p>
          ) : null}
        </header>

        <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="rounded-3xl border border-slate-200/80 bg-white/85 p-4 shadow-sm backdrop-blur">
            <div
              ref={scrollRef}
              className="h-[56vh] space-y-3 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/70 p-3"
            >
              {loading ? (
                <p className="text-sm text-slate-500">
                  Loading chat history...
                </p>
              ) : data && data.messages.length > 0 ? (
                data.messages.map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))
              ) : (
                <p className="text-sm text-slate-500">
                  No chat messages yet. Send a prompt to start.
                </p>
              )}
            </div>
          </div>

          <aside className="rounded-3xl border border-slate-200/80 bg-white/85 p-4 shadow-sm backdrop-blur">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-600">
              Composer
            </h2>
            <form onSubmit={sendMessage} className="mt-3 space-y-3">
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={8}
                placeholder="Ask Claude to inspect, edit, test, or explain something in this Session..."
                disabled={
                  loading || sending || isThreadRunning || isSessionTerminated
                }
                className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-3 text-sm outline-none transition focus:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100"
              />
              <div className="space-y-2">
                <label
                  htmlFor="chat-cwd"
                  className="block text-xs font-medium text-slate-600"
                >
                  Working directory
                </label>
                <input
                  id="chat-cwd"
                  value={cwd}
                  onChange={(event) => setCwd(event.target.value)}
                  disabled={
                    loading || sending || isThreadRunning || isSessionTerminated
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                  placeholder="/workspace/repo"
                />
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="chat-max-turns"
                  className="block text-xs font-medium text-slate-600"
                >
                  Max turns
                </label>
                <input
                  id="chat-max-turns"
                  value={maxTurns}
                  onChange={(event) => setMaxTurns(event.target.value)}
                  disabled={
                    loading || sending || isThreadRunning || isSessionTerminated
                  }
                  inputMode="numeric"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                  placeholder="8"
                />
              </div>
              <button
                type="submit"
                disabled={
                  loading || sending || isThreadRunning || isSessionTerminated
                }
                className="w-full rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sending || isThreadRunning ? "Running..." : "Send"}
              </button>
              {thread ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <p>Saved raw SDK messages: {data?.rawCount ?? 0}</p>
                  <p>Thread updated: {formatTime(thread.updatedAt)}</p>
                  {thread.lastError ? (
                    <p className="mt-1 text-rose-700">
                      Last error: {thread.lastError}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </form>
          </aside>
        </section>
      </div>
    </main>
  );
}
