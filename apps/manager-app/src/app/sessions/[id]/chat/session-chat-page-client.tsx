"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  GetSessionChatResponse,
  SendSessionChatMessageResponse,
  SessionChatMessage,
  SessionChatMessagePart,
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

function stringifyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function JsonDetails({
  label,
  value,
  defaultOpen = false,
}: {
  label: string;
  value: unknown;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="rounded-lg border border-slate-200 bg-white/70 p-2"
    >
      <summary className="cursor-pointer text-xs font-medium text-slate-700">
        {label}
      </summary>
      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded bg-slate-900 p-2 text-xs text-slate-100">
        {stringifyJson(value)}
      </pre>
    </details>
  );
}

function PartView({ part }: { part: SessionChatMessagePart }) {
  switch (part.type) {
    case "text":
      return (
        <pre className="whitespace-pre-wrap break-words font-sans text-sm">
          {part.text}
        </pre>
      );

    case "tool-call":
      return (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/80 p-3 text-sm text-indigo-950">
          <div className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-indigo-700">
            Tool Call
          </div>
          <p className="font-medium">{part.toolName ?? "(unknown tool)"}</p>
          <p className="mt-1 text-xs text-indigo-700">ID: {part.toolUseId}</p>
          {part.input !== undefined ? (
            <div className="mt-2">
              <JsonDetails label="Input" value={part.input} />
            </div>
          ) : null}
        </div>
      );

    case "tool-result":
      return (
        <div
          className={`rounded-xl border p-3 text-sm ${
            part.isError
              ? "border-rose-200 bg-rose-50/80 text-rose-950"
              : "border-emerald-200 bg-emerald-50/80 text-emerald-950"
          }`}
        >
          <div className="mb-1 text-xs font-semibold uppercase tracking-[0.12em]">
            Tool Result
          </div>
          {part.toolUseId ? (
            <p className="mb-2 text-xs opacity-80">ID: {part.toolUseId}</p>
          ) : null}
          <JsonDetails label="Result" value={part.result} />
        </div>
      );

    case "tool-progress":
      return (
        <div className="rounded-xl border border-sky-200 bg-sky-50/80 px-3 py-2 text-sm text-sky-950">
          <p className="font-medium">{part.toolName}</p>
          <p className="text-xs text-sky-700">
            {part.toolUseId} · {part.elapsedSeconds.toFixed(1)}s
          </p>
        </div>
      );

    case "tool-summary":
      return (
        <div className="rounded-xl border border-slate-200 bg-white/80 p-3 text-sm text-slate-900">
          <div className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
            Tool Summary
          </div>
          <pre className="whitespace-pre-wrap break-words font-sans text-sm">
            {part.summary}
          </pre>
          {part.precedingToolUseIds.length > 0 ? (
            <p className="mt-2 text-xs text-slate-500">
              IDs: {part.precedingToolUseIds.join(", ")}
            </p>
          ) : null}
        </div>
      );

    case "result":
      return (
        <div
          className={`rounded-xl border p-3 text-sm ${
            part.isError
              ? "border-rose-200 bg-rose-50/80 text-rose-950"
              : "border-slate-200 bg-white/80 text-slate-900"
          }`}
        >
          <div className="mb-1 flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold uppercase tracking-[0.12em]">
              Run Result
            </span>
            <span>{part.subtype}</span>
          </div>
          <pre className="whitespace-pre-wrap break-words font-sans text-sm">
            {part.summaryText}
          </pre>
          {part.metrics ? (
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
              <p>Turns: {part.metrics.numTurns ?? "-"}</p>
              <p>Cost: {part.metrics.totalCostUsd ?? "-"}</p>
              <p>Duration: {part.metrics.durationMs ?? "-"}ms</p>
              <p>API: {part.metrics.durationApiMs ?? "-"}ms</p>
            </div>
          ) : null}
        </div>
      );

    case "status":
      return (
        <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-3 text-sm text-slate-900">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
            Status · {part.subtype}
          </div>
          <JsonDetails label="Data" value={part.data} />
        </div>
      );

    case "file-batch":
      return (
        <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-3 text-sm text-slate-900">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
            Files Persisted
          </div>
          <p className="text-xs text-slate-600">
            files: {part.files.length} · failed: {part.failed.length}
            {part.processedAt ? ` · ${part.processedAt}` : ""}
          </p>
          <div className="mt-2 space-y-2">
            <JsonDetails label="Files" value={part.files} />
            {part.failed.length > 0 ? (
              <JsonDetails label="Failed" value={part.failed} />
            ) : null}
          </div>
        </div>
      );

    case "stream-event":
      return (
        <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-3 text-sm text-slate-900">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
            Stream Event{part.eventType ? ` · ${part.eventType}` : ""}
          </div>
          <JsonDetails label="Event" value={part.data} />
        </div>
      );

    case "error":
      return (
        <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-3 text-sm text-rose-950">
          <div className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-rose-700">
            Error{part.code ? ` · ${part.code}` : ""}
          </div>
          <pre className="whitespace-pre-wrap break-words font-sans text-sm">
            {part.message}
          </pre>
        </div>
      );

    case "unknown":
      return (
        <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-3 text-sm text-slate-900">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
            Unknown · {part.rawType}
            {part.rawSubtype ? ` / ${part.rawSubtype}` : ""}
          </div>
          <JsonDetails label="Raw" value={part.data} />
        </div>
      );

    default:
      return null;
  }
}

function MessageCard({ message }: { message: SessionChatMessage }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const isTrace = message.metadata?.visibility === "trace";

  if (isSystem) {
    return (
      <div
        className={`rounded-xl border px-3 py-2 text-sm ${
          isTrace
            ? "border-slate-200 bg-slate-100/70 text-slate-800"
            : "border-slate-200 bg-white/85 text-slate-900"
        }`}
      >
        <div className="mb-2 flex items-center justify-between gap-3 text-xs text-slate-500">
          <span>
            {message.metadata?.label ??
              message.metadata?.providerSubtype ??
              message.metadata?.providerMessageType ??
              "System"}
            {isTrace ? " · trace" : ""}
          </span>
          <span>{formatTime(message.createdAt)}</span>
        </div>
        <div className="space-y-2">
          {message.parts.map((part, index) => (
            <PartView key={`${message.id}:${part.type}:${index}`} part={part} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
          isUser
            ? "bg-slate-900 text-white"
            : isTrace
              ? "border border-slate-200 bg-slate-100 text-slate-900"
              : "border border-slate-200 bg-white text-slate-900"
        }`}
      >
        <div
          className={`mb-2 text-[11px] ${isUser ? "text-slate-300" : "text-slate-500"}`}
        >
          {isUser ? "You" : "Claude"}
          {message.metadata?.label ? ` · ${message.metadata.label}` : ""}
          {isTrace ? " · trace" : ""} · {formatTime(message.createdAt)}
        </div>
        <div className="space-y-2">
          {message.parts.map((part, index) => (
            <PartView key={`${message.id}:${part.type}:${index}`} part={part} />
          ))}
        </div>
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
  const [showTrace, setShowTrace] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastAutoScrollCountRef = useRef(-1);

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
            rawCount: body.appendedRawCount,
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

  const visibleMessages = useMemo(() => {
    const messages = data?.messages ?? [];
    return showTrace
      ? messages
      : messages.filter((message) => message.metadata?.visibility !== "trace");
  }, [data?.messages, showTrace]);

  useEffect(() => {
    if (lastAutoScrollCountRef.current === visibleMessages.length) {
      return;
    }
    lastAutoScrollCountRef.current = visibleMessages.length;
    if (!scrollRef.current) {
      return;
    }
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  });

  const traceCount = useMemo(
    () =>
      (data?.messages ?? []).filter(
        (message) => message.metadata?.visibility === "trace",
      ).length,
    [data?.messages],
  );

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
                onClick={() => setShowTrace((current) => !current)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                  showTrace
                    ? "border-sky-300 bg-sky-50 text-sky-900"
                    : "border-slate-300 bg-white text-slate-900"
                }`}
              >
                {showTrace ? "Hide Trace" : "Show Trace"} ({traceCount})
              </button>
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
              ) : visibleMessages.length > 0 ? (
                visibleMessages.map((message) => (
                  <MessageCard key={message.id} message={message} />
                ))
              ) : (
                <p className="text-sm text-slate-500">
                  {showTrace
                    ? "No chat messages yet. Send a prompt to start."
                    : "No visible chat messages yet. Send a prompt or enable Trace."}
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
