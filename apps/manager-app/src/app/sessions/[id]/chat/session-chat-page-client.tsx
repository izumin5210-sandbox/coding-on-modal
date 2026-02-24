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
  GetSessionChatResponse,
  SendSessionChatMessageResponse,
  SessionChatMessage,
  SessionChatMessagePart,
  SessionChatPendingUserInput,
  SessionChatPendingUserInputAnswerValue,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getStringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function normalizeToolNameKey(toolName: string): string {
  return toolName.toLowerCase().replaceAll(/[_-]/g, "");
}

function isExitPlanTool(toolName: string): boolean {
  return normalizeToolNameKey(toolName) === "exitplanmode";
}

function buildExitPlanMarkdown(input: unknown): string | null {
  if (!isRecord(input)) {
    return null;
  }

  const explanation = getStringValue(input.explanation)?.trim();
  const plan = Array.isArray(input.plan) ? input.plan : null;
  if (!plan || plan.length === 0) {
    return null;
  }

  const lines: string[] = [];
  if (explanation) {
    lines.push(explanation, "");
  }

  let itemCount = 0;
  for (const [index, item] of plan.entries()) {
    if (!isRecord(item)) {
      continue;
    }
    const step =
      getStringValue(item.step)?.trim() ||
      getStringValue(item.activeForm)?.trim();
    if (!step) {
      continue;
    }
    const status = getStringValue(item.status)?.trim();
    const prefix = `${index + 1}.`;
    lines.push(status ? `${prefix} [${status}] ${step}` : `${prefix} ${step}`);
    itemCount += 1;
  }

  return itemCount > 0 ? lines.join("\n") : null;
}

function mergeMessagesById(
  existing: SessionChatMessage[],
  appended: SessionChatMessage[],
): SessionChatMessage[] {
  const seen = new Set<string>();
  const merged: SessionChatMessage[] = [];

  for (const message of [...existing, ...appended]) {
    if (seen.has(message.id)) {
      continue;
    }
    seen.add(message.id);
    merged.push(message);
  }

  return merged;
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

type ToolOutcomeState = "output-available" | "output-error";

type ToolPresentationIndex = {
  nameById: Map<string, string>;
  outcomeById: Map<string, ToolOutcomeState>;
};

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

function PartView({
  part,
  toolIndex,
}: {
  part: SessionChatMessagePart;
  toolIndex: ToolPresentationIndex;
}) {
  switch (part.type) {
    case "text":
      return <MessageResponse>{part.text}</MessageResponse>;

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

    case "tool-call": {
      const toolState =
        (part.toolUseId
          ? toolIndex.outcomeById.get(part.toolUseId)
          : undefined) ?? "input-available";
      return (
        <ToolLogCard
          toolName={part.toolName ?? "tool"}
          toolUseId={part.toolUseId}
          state={toolState}
          input={part.input}
        />
      );
    }

    case "tool-result":
      return (
        <ToolLogCard
          toolName={
            (part.toolUseId
              ? toolIndex.nameById.get(part.toolUseId)
              : undefined) ?? "tool-result"
          }
          toolUseId={part.toolUseId}
          state={part.isError ? "output-error" : "output-available"}
          output={part.result}
          errorText={
            part.isError && typeof part.result === "string"
              ? part.result
              : undefined
          }
        />
      );

    case "tool-progress":
      return (
        <ToolLogCard
          toolName={part.toolName}
          toolUseId={part.toolUseId}
          state="input-streaming"
          meta={
            <p className="text-xs text-muted-foreground">
              elapsed: {part.elapsedSeconds.toFixed(1)}s
            </p>
          }
        />
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

function TranscriptMessage({
  message,
  toolIndex,
}: {
  message: SessionChatMessage;
  toolIndex: ToolPresentationIndex;
}) {
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
            <PartView
              key={`${message.id}:${part.type}:${index}`}
              part={part}
              toolIndex={toolIndex}
            />
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
          {isExitPlanTool(pending.toolName) ? (
            (() => {
              const markdown = buildExitPlanMarkdown(pending.input);
              if (!markdown) {
                return <JsonDetails label="Tool Input" value={pending.input} />;
              }
              return (
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
                    Proposed Plan
                  </div>
                  <MessageResponse>{markdown}</MessageResponse>
                </div>
              );
            })()
          ) : (
            <JsonDetails label="Tool Input" value={pending.input} />
          )}
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
  const [data, setData] = useState<GetSessionChatResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
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

  const refreshChat = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!silent) {
        setLoading(true);
        setError(null);
      }
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
        if (!silent) {
          setError(
            loadError instanceof Error ? loadError.message : String(loadError),
          );
        }
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [sessionId],
  );

  const loadChat = useCallback(async () => {
    await refreshChat();
  }, [refreshChat]);

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
              pendingUserInput: body.pendingUserInput ?? null,
            };
          }
          const currentIsAtLeastAsNew =
            current.thread.updatedAt >= body.thread.updatedAt;
          return {
            session: body.session,
            thread: body.thread,
            messages: mergeMessagesById(
              current.messages,
              body.appendedMessages,
            ),
            rawCount: currentIsAtLeastAsNew
              ? current.rawCount
              : current.rawCount + body.appendedRawCount,
            pendingUserInput: body.pendingUserInput ?? null,
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

  const pendingUserInput = data?.pendingUserInput ?? null;
  const pendingRequestId = pendingUserInput?.requestId ?? null;

  useEffect(() => {
    setPendingSubmitError(null);
    setPendingSubmitting(false);
    if (pendingRequestId) {
      setPendingDenyMessage("");
      setPendingAskSelections({});
      setPendingAskOtherAnswers({});
      return;
    }
    setPendingDenyMessage("");
  }, [pendingRequestId]);

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
        const response = await fetch(
          `/api/sessions/${sessionId}/chat/user-input`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              requestId: pendingUserInput.requestId,
              behavior: payload.behavior,
              answers: payload.answers,
              message: payload.message,
            }),
          },
        );
        if (!response.ok) {
          throw new Error(await parseError(response));
        }
        setNotice(
          payload.behavior === "allow"
            ? `Submitted response for ${pendingUserInput.toolName}.`
            : `Denied ${pendingUserInput.toolName}.`,
        );
        await refreshChat({ silent: true });
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
    [pendingSubmitting, pendingUserInput, refreshChat, sessionId],
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

  const toolIndex = useMemo<ToolPresentationIndex>(() => {
    const nameById = new Map<string, string>();
    const outcomeById = new Map<string, ToolOutcomeState>();

    for (const message of data?.messages ?? []) {
      for (const part of message.parts) {
        if (part.type === "tool-call") {
          if (
            part.toolUseId &&
            part.toolName &&
            !nameById.has(part.toolUseId)
          ) {
            nameById.set(part.toolUseId, part.toolName);
          }
          continue;
        }
        if (part.type === "tool-result" && part.toolUseId) {
          outcomeById.set(
            part.toolUseId,
            part.isError ? "output-error" : "output-available",
          );
        }
      }
    }

    return { nameById, outcomeById };
  }, [data?.messages]);

  useEffect(() => {
    if (!(sending || data?.thread.isRunning || pendingUserInput)) {
      return;
    }
    const timer = window.setInterval(() => {
      void refreshChat({ silent: true });
    }, 1500);
    return () => window.clearInterval(timer);
  }, [data?.thread.isRunning, pendingUserInput, refreshChat, sending]);

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
                  <TranscriptMessage
                    key={message.id}
                    message={message}
                    toolIndex={toolIndex}
                  />
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
