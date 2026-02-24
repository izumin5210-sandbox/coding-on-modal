"use client";

import {
  BotIcon,
  EyeIcon,
  EyeOffIcon,
  MessagesSquareIcon,
  Settings2Icon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import type {
  GetSessionChatResponse,
  SendSessionChatMessageResponse,
  SessionChatMessage,
  SessionChatMessagePart,
} from "@/lib/session-chat-types";
import { cn } from "@/lib/utils";

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
      className="rounded-lg border border-border/70 bg-background/90 p-2"
    >
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
        {label}
      </summary>
      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded bg-slate-950 p-2 text-xs text-slate-100">
        {stringifyJson(value)}
      </pre>
    </details>
  );
}

function PartView({ part }: { part: SessionChatMessagePart }) {
  switch (part.type) {
    case "text":
      return <MessageResponse>{part.text}</MessageResponse>;

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
          className={cn(
            "rounded-xl border p-3 text-sm",
            part.isError
              ? "border-rose-200 bg-rose-50/80 text-rose-950"
              : "border-emerald-200 bg-emerald-50/80 text-emerald-950",
          )}
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
          <MessageResponse>{part.summary}</MessageResponse>
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
          className={cn(
            "rounded-xl border p-3 text-sm",
            part.isError
              ? "border-rose-200 bg-rose-50/80 text-rose-950"
              : "border-slate-200 bg-white/80 text-slate-900",
          )}
        >
          <div className="mb-1 flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold uppercase tracking-[0.12em]">
              Run Result
            </span>
            <span>{part.subtype}</span>
          </div>
          <MessageResponse>{part.summaryText}</MessageResponse>
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
          <MessageResponse>{part.message}</MessageResponse>
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

function TranscriptMessage({ message }: { message: SessionChatMessage }) {
  const isTrace = message.metadata?.visibility === "trace";
  const isSystem = message.role === "system";
  const from = message.role === "user" ? "user" : "assistant";

  return (
    <Message from={from} className={cn(isTrace && "opacity-90")}>
      <MessageContent
        className={cn(
          "max-w-full",
          from === "assistant" &&
            "rounded-xl border border-border/60 bg-card px-4 py-3",
          isSystem && "rounded-xl border border-border/60 bg-card/85 px-4 py-3",
          isTrace && "border-dashed bg-muted/40",
        )}
      >
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>
            {message.role === "user" ? "You" : "Claude"}
            {message.metadata?.label ? ` · ${message.metadata.label}` : ""}
            {isTrace ? " · trace" : ""}
          </span>
          <span>{formatTime(message.createdAt)}</span>
        </div>
        <div className="space-y-2">
          {message.parts.map((part, index) => (
            <PartView key={`${message.id}:${part.type}:${index}`} part={part} />
          ))}
        </div>
      </MessageContent>
    </Message>
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
  const [cwd, setCwd] = useState("");
  const [maxTurns, setMaxTurns] = useState("8");
  const [showTrace, setShowTrace] = useState(false);

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

  const submitPrompt = useCallback(
    async (text: string) => {
      if (!data || sending) {
        return;
      }

      const trimmedPrompt = text.trim();
      if (!trimmedPrompt) {
        throw new Error("Prompt must not be empty.");
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
        if (body.run.isError) {
          setNotice(
            `Run finished with error${body.run.subtype ? ` (${body.run.subtype})` : ""}.`,
          );
        } else {
          setNotice("Run finished.");
        }
      } catch (sendError) {
        const message =
          sendError instanceof Error ? sendError.message : String(sendError);
        setError(message);
        throw sendError;
      } finally {
        setSending(false);
      }
    },
    [cwd, data, maxTurns, sending, sessionId],
  );

  useEffect(() => {
    void loadChat();
  }, [loadChat]);

  const visibleMessages = useMemo(() => {
    const messages = data?.messages ?? [];
    return showTrace
      ? messages
      : messages.filter((message) => message.metadata?.visibility !== "trace");
  }, [data?.messages, showTrace]);

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
  const inputDisabled =
    loading || sending || isThreadRunning || isSessionTerminated;
  const submitStatus =
    inputDisabled && (sending || isThreadRunning) ? "submitted" : "ready";

  return (
    <main className="h-screen bg-[radial-gradient(circle_at_top_left,_#e0f2fe,_transparent_45%),radial-gradient(circle_at_top_right,_#fde68a,_transparent_40%),#f8fafc] p-3 sm:p-4">
      <div className="mx-auto flex h-full max-w-6xl flex-col gap-3">
        <header className="rounded-3xl border border-slate-200/80 bg-white/85 p-4 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <MessagesSquareIcon className="size-5 text-slate-700" />
                <h1 className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
                  Session Chat
                </h1>
                {session ? <StatusBadge status={session.status} /> : null}
              </div>
              {session ? (
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 sm:text-sm">
                  <span className="font-medium text-slate-900">
                    {session.name}
                  </span>
                  <span>ID: {session.id}</span>
                  <span className="truncate">{session.workspacePath}</span>
                </div>
              ) : (
                <p className="mt-1 text-sm text-slate-600">
                  {loading ? "Loading session..." : "Session data unavailable"}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
              >
                Back
              </Link>
              <button
                type="button"
                onClick={() => setShowTrace((current) => !current)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium",
                  showTrace
                    ? "border-sky-300 bg-sky-50 text-sky-900"
                    : "border-slate-300 bg-white text-slate-900",
                )}
              >
                {showTrace ? (
                  <EyeOffIcon className="size-4" />
                ) : (
                  <EyeIcon className="size-4" />
                )}
                {showTrace ? "Hide Trace" : "Show Trace"}
                <span className="rounded-full bg-black/5 px-1.5 py-0.5 text-xs">
                  {traceCount}
                </span>
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
            <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
              {notice}
            </p>
          ) : null}
        </header>

        <div className="min-h-0 flex-1 rounded-3xl border border-slate-200/80 bg-white/85 shadow-sm backdrop-blur">
          <Conversation className="h-full min-h-0">
            <ConversationContent className="mx-auto w-full max-w-4xl gap-4 p-4 sm:p-6">
              {loading ? (
                <ConversationEmptyState
                  icon={<BotIcon className="size-5" />}
                  title="Loading chat"
                  description="Fetching Session transcript and trace events..."
                />
              ) : visibleMessages.length > 0 ? (
                visibleMessages.map((message) => (
                  <TranscriptMessage key={message.id} message={message} />
                ))
              ) : (
                <ConversationEmptyState
                  icon={<BotIcon className="size-5" />}
                  title="Start the Session conversation"
                  description={
                    showTrace
                      ? "No messages yet. Send a prompt to begin."
                      : "No visible messages yet. Send a prompt or enable trace."
                  }
                />
              )}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>
        </div>

        <section className="mx-auto w-full max-w-4xl rounded-3xl border border-slate-200/80 bg-white/90 p-3 shadow-lg backdrop-blur">
          <PromptInput
            onSubmit={async (message) => {
              await submitPrompt(message.text);
            }}
            className="rounded-2xl border border-slate-200 bg-white"
          >
            <PromptInputBody>
              <PromptInputTextarea
                disabled={inputDisabled}
                placeholder="Ask Claude to inspect, edit, test, or explain something in this Session..."
              />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
                  <Settings2Icon className="size-3.5" />
                  Session options below
                </div>
              </PromptInputTools>
              <PromptInputSubmit
                disabled={inputDisabled}
                status={submitStatus}
                className="rounded-lg"
              />
            </PromptInputFooter>
          </PromptInput>

          <details className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
            <summary className="cursor-pointer list-none text-sm font-medium text-slate-900">
              Session Options
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_140px_auto] sm:items-end">
              <label className="block text-xs font-medium text-slate-600">
                Working directory
                <input
                  value={cwd}
                  onChange={(event) => setCwd(event.target.value)}
                  disabled={inputDisabled}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                  placeholder="/workspace/repo"
                />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Max turns
                <input
                  value={maxTurns}
                  onChange={(event) => setMaxTurns(event.target.value)}
                  disabled={inputDisabled}
                  inputMode="numeric"
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                  placeholder="8"
                />
              </label>
              <div className="text-xs text-slate-600 sm:pb-2">
                Raw SDK messages: {data?.rawCount ?? 0}
                {thread ? ` · Updated: ${formatTime(thread.updatedAt)}` : ""}
                {thread?.lastError ? ` · Last error: ${thread.lastError}` : ""}
              </div>
            </div>
          </details>
        </section>
      </div>
    </main>
  );
}
