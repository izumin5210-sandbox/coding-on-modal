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
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import type {
  AgentMessage,
  AgentMessagePart,
  SessionChatPendingUserInput,
  SessionChatPendingUserInputAnswerValue,
} from "@/lib/session-chat-types";
import {
  useSendSessionChatMessageMutation,
  useSessionChatQuery,
  useSubmitSessionChatUserInputMutation,
} from "@/lib/graphql/session-chat";
import { cn } from "@/lib/utils";

function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
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

function buildAnswerValue(
  selected: string[],
  otherText: string,
  multiSelect: boolean,
): SessionChatPendingUserInputAnswerValue | null {
  const normalizedSelected = selected
    .map((value) => value.trim())
    .filter(Boolean);
  const normalizedOther = otherText.trim();
  const values = multiSelect
    ? [
        ...normalizedSelected,
        ...(normalizedOther ? [`Other: ${normalizedOther}`] : []),
      ]
    : [
        normalizedSelected[0] ??
          (normalizedOther ? `Other: ${normalizedOther}` : ""),
      ].filter(Boolean);

  if (values.length === 0) {
    return null;
  }
  return multiSelect ? values : (values[0] ?? null);
}

function PendingToolCallBanner({
  pending,
}: {
  pending: SessionChatPendingUserInput;
}) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-950">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">
            User Input Required
          </p>
          <p className="mt-1 font-medium">
            {pending.toolName}
            <span className="ml-2 text-xs font-normal text-amber-700/90">
              toolUseId: {pending.toolUseId}
            </span>
          </p>
        </div>
        <span className="text-xs text-amber-700">
          {formatTime(pending.createdAt)}
        </span>
      </div>
      {pending.decisionReason ? (
        <p className="mt-2 text-xs text-amber-800">
          reason: {pending.decisionReason}
        </p>
      ) : null}
      {pending.blockedPath ? (
        <p className="mt-1 text-xs text-amber-800">
          path: {pending.blockedPath}
        </p>
      ) : null}
    </div>
  );
}

function ToolLogCard({
  toolName,
  toolUseId,
  state,
  input,
  output,
  errorText,
  meta,
}: {
  toolName: string;
  toolUseId?: string;
  state:
    | "approval-requested"
    | "approval-responded"
    | "input-streaming"
    | "input-available"
    | "output-available"
    | "output-denied"
    | "output-error";
  input?: unknown;
  output?: unknown;
  errorText?: string;
  meta?: React.ReactNode;
}) {
  return (
    <Tool defaultOpen={state !== "output-available"} className="mb-0 bg-card">
      <ToolHeader type="dynamic-tool" toolName={toolName} state={state} />
      <ToolContent className="space-y-3">
        {toolUseId ? (
          <p className="text-xs text-muted-foreground">ID: {toolUseId}</p>
        ) : null}
        {meta}
        {input !== undefined ? <ToolInput input={input as never} /> : null}
        {output !== undefined || errorText ? (
          <ToolOutput
            output={output as never}
            errorText={(errorText as never) ?? (undefined as never)}
          />
        ) : null}
      </ToolContent>
    </Tool>
  );
}

function PartView({ part }: { part: AgentMessagePart }) {
  switch (part.type) {
    case "text":
      return <MessageResponse>{part.text}</MessageResponse>;

    case "reasoning":
      return (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-3 text-sm text-slate-700">
          <div className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Reasoning
          </div>
          <MessageResponse>{part.text}</MessageResponse>
        </div>
      );

    case "dynamic-tool":
      return (
        <ToolLogCard
          toolName={part.toolName}
          toolUseId={part.toolCallId}
          state={part.state}
          input={"input" in part ? part.input : undefined}
          output={part.state === "output-available" ? part.output : undefined}
          errorText={part.state === "output-error" ? part.errorText : undefined}
          meta={
            part.state === "output-denied" ? (
              <p className="text-xs text-muted-foreground">
                approval denied
                {part.approval.reason ? `: ${part.approval.reason}` : ""}
              </p>
            ) : undefined
          }
        />
      );

    case "data-tool_progress":
      return (
        <ToolLogCard
          toolName={part.data.toolName}
          toolUseId={part.data.toolUseId}
          state="input-streaming"
          meta={
            <p className="text-xs text-muted-foreground">
              elapsed: {part.data.elapsedSeconds.toFixed(1)}s
            </p>
          }
        />
      );

    case "data-tool_summary":
      return (
        <div className="rounded-xl border border-slate-200 bg-white/80 p-3 text-sm text-slate-900">
          <div className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
            Tool Summary
          </div>
          <MessageResponse>{part.data.summary}</MessageResponse>
          {part.data.precedingToolUseIds.length > 0 ? (
            <p className="mt-2 text-xs text-slate-500">
              IDs: {part.data.precedingToolUseIds.join(", ")}
            </p>
          ) : null}
        </div>
      );

    case "data-run_result":
      return (
        <div
          className={cn(
            "rounded-xl border p-3 text-sm",
            part.data.isError
              ? "border-rose-200 bg-rose-50/80 text-rose-950"
              : "border-slate-200 bg-white/80 text-slate-900",
          )}
        >
          <div className="mb-1 flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold uppercase tracking-[0.12em]">
              Run Result
            </span>
            <span>{part.data.subtype}</span>
          </div>
          <MessageResponse>{part.data.summaryText}</MessageResponse>
          {part.data.metrics ? (
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
              <p>Turns: {part.data.metrics.numTurns ?? "-"}</p>
              <p>Cost: {part.data.metrics.totalCostUsd ?? "-"}</p>
              <p>Duration: {part.data.metrics.durationMs ?? "-"}ms</p>
              <p>API: {part.data.metrics.durationApiMs ?? "-"}ms</p>
            </div>
          ) : null}
        </div>
      );

    case "data-status_event":
      return (
        <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-3 text-sm text-slate-900">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
            Status · {part.data.subtype}
          </div>
          <JsonDetails label="Data" value={part.data.data} />
        </div>
      );

    case "data-file_batch":
      return (
        <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-3 text-sm text-slate-900">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
            Files Persisted
          </div>
          <p className="text-xs text-slate-600">
            files: {part.data.files.length} · failed: {part.data.failed.length}
            {part.data.processedAt ? ` · ${part.data.processedAt}` : ""}
          </p>
          <div className="mt-2 space-y-2">
            <JsonDetails label="Files" value={part.data.files} />
            {part.data.failed.length > 0 ? (
              <JsonDetails label="Failed" value={part.data.failed} />
            ) : null}
          </div>
        </div>
      );

    case "data-stream_event":
      return (
        <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-3 text-sm text-slate-900">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
            Stream Event{part.data.eventType ? ` · ${part.data.eventType}` : ""}
          </div>
          <JsonDetails label="Event" value={part.data.data} />
        </div>
      );

    case "data-error_event":
      return (
        <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-3 text-sm text-rose-950">
          <div className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-rose-700">
            Error{part.data.code ? ` · ${part.data.code}` : ""}
          </div>
          <MessageResponse>{part.data.message}</MessageResponse>
        </div>
      );

    case "data-unknown_event":
      return (
        <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-3 text-sm text-slate-900">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
            Unknown · {part.data.rawType}
            {part.data.rawSubtype ? ` / ${part.data.rawSubtype}` : ""}
          </div>
          <JsonDetails label="Raw" value={part.data.data} />
        </div>
      );

    default:
      return null;
  }
}

function TranscriptMessage({ message }: { message: AgentMessage }) {
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
          <span>{formatTime(message.metadata?.createdAt ?? "")}</span>
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

function PendingUserInputPanel({
  pending,
  submitting,
  submitError,
  denyMessage,
  onDenyMessageChange,
  askSelections,
  askOtherAnswers,
  onAskSelectionChange,
  onAskOtherChange,
  onApprove,
  onDeny,
}: {
  pending: SessionChatPendingUserInput;
  submitting: boolean;
  submitError: string | null;
  denyMessage: string;
  onDenyMessageChange: (value: string) => void;
  askSelections: Record<string, string[]>;
  askOtherAnswers: Record<string, string>;
  onAskSelectionChange: (
    header: string,
    nextValue: string,
    checked: boolean,
    multiSelect: boolean,
  ) => void;
  onAskOtherChange: (header: string, value: string) => void;
  onApprove: () => void;
  onDeny: () => void;
}) {
  return (
    <section className="mx-auto w-full max-w-4xl space-y-3 rounded-3xl border border-amber-200/90 bg-white/95 p-4 shadow-sm">
      <PendingToolCallBanner pending={pending} />

      {pending.kind === "ask-user-question" ? (
        <div className="space-y-4">
          {pending.questions.map((question) => {
            const selected = askSelections[question.header] ?? [];
            const other = askOtherAnswers[question.header] ?? "";
            return (
              <div
                key={`${pending.requestId}:${question.header}`}
                className="rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div className="mb-3 flex items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-700">
                    {question.header}
                  </span>
                  <span className="text-xs text-slate-500">
                    {question.multiSelect ? "Multiple" : "Single"} choice
                  </span>
                </div>
                <p className="text-sm font-medium text-slate-900">
                  {question.question}
                </p>
                <div className="mt-3 space-y-2">
                  {question.options.map((option) => {
                    const checked = selected.includes(option.label);
                    return (
                      <label
                        key={`${question.header}:${option.label}`}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition",
                          checked
                            ? "border-sky-300 bg-sky-50"
                            : "border-slate-200 bg-white hover:border-slate-300",
                        )}
                      >
                        <input
                          type={question.multiSelect ? "checkbox" : "radio"}
                          name={`${pending.requestId}:${question.header}`}
                          value={option.label}
                          checked={checked}
                          disabled={submitting}
                          onChange={(event) =>
                            onAskSelectionChange(
                              question.header,
                              option.label,
                              event.target.checked,
                              question.multiSelect,
                            )
                          }
                          className="mt-0.5"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-slate-900">
                            {option.label}
                          </span>
                          <span className="block text-xs text-slate-600">
                            {option.description}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <label className="mt-3 block text-xs font-medium text-slate-600">
                  Other (optional)
                  <input
                    type="text"
                    value={other}
                    onChange={(event) =>
                      onAskOtherChange(question.header, event.target.value)
                    }
                    disabled={submitting}
                    placeholder="Add your own answer"
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                  />
                </label>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-700">
            Claude is asking for approval before continuing this tool call.
          </p>
          <JsonDetails label="Tool Input" value={pending.input} />
          {pending.suggestions ? (
            <JsonDetails
              label="Permission Suggestions"
              value={pending.suggestions}
            />
          ) : null}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
        <label className="block text-xs font-medium text-slate-600">
          Deny message (optional)
          <textarea
            value={denyMessage}
            onChange={(event) => onDenyMessageChange(event.target.value)}
            disabled={submitting}
            rows={2}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100"
            placeholder="Optional feedback when denying"
          />
        </label>
        {submitError ? (
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {submitError}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onApprove}
            disabled={submitting}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Submitting..." : "Approve / Continue"}
          </button>
          <button
            type="button"
            onClick={onDeny}
            disabled={submitting}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Deny
          </button>
        </div>
      </div>
    </section>
  );
}

export default function SessionChatPageClient({
  sessionId,
}: {
  sessionId: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cwd, setCwd] = useState("");
  const [maxTurns, setMaxTurns] = useState("8");
  const [showTrace, setShowTrace] = useState(false);
  const [pendingSubmitError, setPendingSubmitError] = useState<string | null>(
    null,
  );
  const [pendingSubmitting, setPendingSubmitting] = useState(false);
  const [pendingDenyMessage, setPendingDenyMessage] = useState("");
  const [pendingAskSelections, setPendingAskSelections] = useState<
    Record<string, string[]>
  >({});
  const [pendingAskOtherAnswers, setPendingAskOtherAnswers] = useState<
    Record<string, string>
  >({});
  const chatQuery = useSessionChatQuery(sessionId);
  const sendMessageMutation = useSendSessionChatMessageMutation(sessionId);
  const submitPendingUserInputMutation =
    useSubmitSessionChatUserInputMutation(sessionId);
  const data = chatQuery.data ?? null;
  const loading = chatQuery.isPending;
  const sending = sendMessageMutation.isPending;
  const refreshing = chatQuery.isFetching && !chatQuery.isPending;

  const refreshChat = useCallback(async () => {
    setError(null);
    await chatQuery.refetch();
  }, [chatQuery]);

  const submitPrompt = useCallback(
    async (text: string) => {
      const trimmedPrompt = text.trim();
      if (!trimmedPrompt) {
        throw new Error("Prompt must not be empty.");
      }

      setError(null);
      setNotice(null);

      try {
        const maxTurnsNumber = Number(maxTurns);
        await sendMessageMutation.mutateAsync({
          prompt: trimmedPrompt,
          cwd: cwd.trim() || undefined,
          maxTurns: Number.isFinite(maxTurnsNumber)
            ? Math.max(1, Math.min(20, Math.floor(maxTurnsNumber)))
            : undefined,
        });
        setNotice("Run submitted. Waiting for results...");
        await chatQuery.refetch();
      } catch (sendError) {
        const message =
          sendError instanceof Error ? sendError.message : String(sendError);
        setError(message);
        throw sendError;
      }
    },
    [chatQuery, cwd, maxTurns, sendMessageMutation],
  );

  useEffect(() => {
    if (!data) {
      return;
    }

    setCwd(
      (current) => current || data.thread.cwd || data.session.workspacePath,
    );
    setMaxTurns((current) => current || String(data.thread.maxTurns || 8));
  }, [data]);

  const pendingUserInput = data?.pendingUserInput ?? null;
  const pendingToolUseId = pendingUserInput?.toolUseId ?? null;

  useEffect(() => {
    setPendingSubmitError(null);
    if (pendingToolUseId) {
      setPendingDenyMessage("");
      setPendingAskSelections({});
      setPendingAskOtherAnswers({});
      return;
    }
    setPendingDenyMessage("");
  }, [pendingToolUseId]);

  const submitPendingUserInput = useCallback(
    async (payload: {
      behavior: "allow" | "deny";
      answers?: Record<string, SessionChatPendingUserInputAnswerValue>;
      message?: string;
    }) => {
      if (!pendingUserInput || pendingSubmitting) {
        return;
      }

      setPendingSubmitting(true);
      setPendingSubmitError(null);
      try {
        await submitPendingUserInputMutation.mutateAsync({
          toolUseId: pendingUserInput.toolUseId,
          behavior: payload.behavior,
          answers: payload.answers,
          message: payload.message,
        });
        setNotice(
          payload.behavior === "allow"
            ? `Submitted response for ${pendingUserInput.toolName}.`
            : `Denied ${pendingUserInput.toolName}.`,
        );
        await chatQuery.refetch();
      } catch (submitError) {
        setPendingSubmitError(
          submitError instanceof Error
            ? submitError.message
            : String(submitError),
        );
      } finally {
        setPendingSubmitting(false);
      }
    },
    [
      chatQuery,
      pendingSubmitting,
      pendingUserInput,
      submitPendingUserInputMutation,
    ],
  );

  const handleApprovePendingUserInput = useCallback(async () => {
    if (!pendingUserInput) {
      return;
    }
    if (pendingUserInput.kind === "ask-user-question") {
      const answers: Record<string, SessionChatPendingUserInputAnswerValue> =
        {};
      for (const question of pendingUserInput.questions) {
        const selected = pendingAskSelections[question.header] ?? [];
        const other = pendingAskOtherAnswers[question.header] ?? "";
        const answer = buildAnswerValue(selected, other, question.multiSelect);
        if (!answer) {
          setPendingSubmitError(`Answer required: ${question.header}`);
          return;
        }
        answers[question.question] = answer;
      }
      await submitPendingUserInput({
        behavior: "allow",
        answers,
      });
      return;
    }

    await submitPendingUserInput({ behavior: "allow" });
  }, [
    pendingAskOtherAnswers,
    pendingAskSelections,
    pendingUserInput,
    submitPendingUserInput,
  ]);

  const handleDenyPendingUserInput = useCallback(async () => {
    await submitPendingUserInput({
      behavior: "deny",
      message: pendingDenyMessage.trim() || undefined,
    });
  }, [pendingDenyMessage, submitPendingUserInput]);

  const handleAskSelectionChange = useCallback(
    (
      header: string,
      nextValue: string,
      checked: boolean,
      multiSelect: boolean,
    ) => {
      setPendingAskSelections((current) => {
        const prev = current[header] ?? [];
        if (multiSelect) {
          const next = checked
            ? Array.from(new Set([...prev, nextValue]))
            : prev.filter((value) => value !== nextValue);
          return { ...current, [header]: next };
        }
        return { ...current, [header]: checked ? [nextValue] : [] };
      });
    },
    [],
  );

  const handleAskOtherChange = useCallback((header: string, value: string) => {
    setPendingAskOtherAnswers((current) => ({ ...current, [header]: value }));
  }, []);

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
  const fetchError =
    chatQuery.error instanceof Error ? chatQuery.error.message : null;
  const effectiveError = error ?? fetchError;

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
                  void refreshChat();
                }}
                disabled={refreshing || sending}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          {effectiveError ? (
            <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {effectiveError}
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

        {pendingUserInput ? (
          <PendingUserInputPanel
            pending={pendingUserInput}
            submitting={pendingSubmitting}
            submitError={pendingSubmitError}
            denyMessage={pendingDenyMessage}
            onDenyMessageChange={setPendingDenyMessage}
            askSelections={pendingAskSelections}
            askOtherAnswers={pendingAskOtherAnswers}
            onAskSelectionChange={handleAskSelectionChange}
            onAskOtherChange={handleAskOtherChange}
            onApprove={() => {
              void handleApprovePendingUserInput();
            }}
            onDeny={() => {
              void handleDenyPendingUserInput();
            }}
          />
        ) : null}

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
