import { randomUUID } from "node:crypto";
import type {
  PermissionResult,
  PermissionUpdate,
} from "@anthropic-ai/claude-agent-sdk";
import type {
  SessionChatPendingUserInput,
  SessionChatPendingUserInputQuestion,
} from "@/lib/session-chat-types";

type PendingAnswerValue = string | string[];

type PendingToolRequestOptions = {
  sessionId: string;
  toolName: string;
  toolUseId: string;
  input: Record<string, unknown>;
  signal: AbortSignal;
  suggestions?: PermissionUpdate[];
  blockedPath?: string;
  decisionReason?: string;
  agentId?: string;
};

type SubmitPendingToolRequestInput = {
  sessionId: string;
  requestId: string;
  behavior: "allow" | "deny";
  message?: string;
  answers?: Record<string, PendingAnswerValue>;
};

type PendingEntry = {
  request: SessionChatPendingUserInput;
  rawInput: Record<string, unknown>;
  settled: boolean;
  resolve: (result: PermissionResult) => void;
  reject: (error: Error) => void;
  abortHandler: () => void;
};

const pendingBySessionId = new Map<string, PendingEntry>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function normalizeAskUserQuestions(
  input: Record<string, unknown>,
): SessionChatPendingUserInputQuestion[] | null {
  const { questions } = input;
  if (!Array.isArray(questions)) {
    return null;
  }

  const normalized: SessionChatPendingUserInputQuestion[] = [];
  for (const item of questions) {
    if (!isRecord(item) || !Array.isArray(item.options)) {
      return null;
    }
    const question = getString(item.question);
    const header = getString(item.header);
    if (!question || !header) {
      return null;
    }
    const options = item.options
      .map((option) => {
        if (!isRecord(option)) {
          return null;
        }
        const label = getString(option.label);
        const description = getString(option.description);
        if (!label || !description) {
          return null;
        }
        return { label, description };
      })
      .filter((option): option is { label: string; description: string } =>
        Boolean(option),
      );
    if (options.length !== item.options.length || options.length < 2) {
      return null;
    }
    normalized.push({
      header,
      question,
      options,
      multiSelect: item.multiSelect === true,
    });
  }

  return normalized.length > 0 ? normalized : null;
}

function buildPendingRequest(
  options: PendingToolRequestOptions,
): SessionChatPendingUserInput {
  const normalizedToolNameKey = options.toolName
    .toLowerCase()
    .replaceAll(/[_-]/g, "");
  const askQuestions =
    normalizedToolNameKey === "askuserquestion"
      ? normalizeAskUserQuestions(options.input)
      : null;

  const base = {
    requestId: `ccuir_${randomUUID().replaceAll("-", "")}`,
    toolName: options.toolName,
    toolUseId: options.toolUseId,
    createdAt: new Date().toISOString(),
    input: options.input,
    decisionReason: options.decisionReason,
    blockedPath: options.blockedPath,
    agentId: options.agentId,
    suggestions: options.suggestions as unknown[] | undefined,
  };

  if (askQuestions) {
    return {
      ...base,
      kind: "ask-user-question",
      questions: askQuestions,
    };
  }

  return {
    ...base,
    kind: "tool-approval",
  };
}

function defaultDenyMessage(request: SessionChatPendingUserInput): string {
  if (request.kind === "ask-user-question") {
    return "User declined to answer the question.";
  }
  return `User denied tool execution: ${request.toolName}`;
}

function normalizeSubmittedAnswers(
  request: Extract<SessionChatPendingUserInput, { kind: "ask-user-question" }>,
  answers: Record<string, PendingAnswerValue> | undefined,
): Record<string, PendingAnswerValue> {
  if (!answers || !isRecord(answers)) {
    throw new Error("answers is required for AskUserQuestion.");
  }

  const normalized: Record<string, PendingAnswerValue> = {};
  for (const question of request.questions) {
    const answer = answers[question.question];
    if (typeof answer === "string") {
      const value = answer.trim();
      if (!value) {
        throw new Error(`Missing answer for "${question.header}".`);
      }
      normalized[question.question] = value;
      continue;
    }
    if (Array.isArray(answer)) {
      const values = answer
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean);
      if (values.length === 0) {
        throw new Error(`Missing answer for "${question.header}".`);
      }
      normalized[question.question] = values;
      continue;
    }
    throw new Error(`Missing answer for "${question.header}".`);
  }
  return normalized;
}

function shouldInterceptUserFeedbackTool(toolName: string): boolean {
  const normalized = toolName.toLowerCase().replaceAll(/[_-]/g, "");
  return normalized === "askuserquestion" || normalized === "exitplanmode";
}

export function createClaudeChatPermissionPolicy(options: {
  sessionId: string;
}) {
  const permissionMode = "bypassPermissions" as const;

  return {
    permissionMode,
    allowDangerouslySkipPermissions: true as const,
    canUseTool: async (
      toolName: string,
      toolInput: Record<string, unknown>,
      sdkOptions: {
        signal: AbortSignal;
        suggestions?: PermissionUpdate[];
        blockedPath?: string;
        decisionReason?: string;
        toolUseID: string;
        agentID?: string;
      },
    ): Promise<PermissionResult> => {
      // With bypassPermissions enabled, normal tools proceed automatically.
      // Only user-feedback tools are bridged to the web UI here.
      if (!shouldInterceptUserFeedbackTool(toolName)) {
        return {
          behavior: "allow",
          updatedInput: toolInput,
          toolUseID: sdkOptions.toolUseID,
        };
      }

      return waitForClaudeChatUserInput({
        sessionId: options.sessionId,
        toolName,
        toolUseId: sdkOptions.toolUseID,
        input: toolInput,
        signal: sdkOptions.signal,
        suggestions: sdkOptions.suggestions,
        blockedPath: sdkOptions.blockedPath,
        decisionReason: sdkOptions.decisionReason,
        agentId: sdkOptions.agentID,
      });
    },
  };
}

export function getPendingClaudeChatUserInput(
  sessionId: string,
): SessionChatPendingUserInput | null {
  return pendingBySessionId.get(sessionId)?.request ?? null;
}

export function waitForClaudeChatUserInput(
  options: PendingToolRequestOptions,
): Promise<PermissionResult> {
  const existing = pendingBySessionId.get(options.sessionId);
  if (existing && !existing.settled) {
    return Promise.resolve({
      behavior: "deny",
      message: "Another user input request is already pending.",
      toolUseID: options.toolUseId,
    });
  }

  const request = buildPendingRequest(options);

  return new Promise<PermissionResult>((resolve, reject) => {
    const entry: PendingEntry = {
      request,
      rawInput: options.input,
      settled: false,
      resolve: (result) => {
        if (entry.settled) {
          return;
        }
        entry.settled = true;
        options.signal.removeEventListener("abort", entry.abortHandler);
        pendingBySessionId.delete(options.sessionId);
        resolve(result);
      },
      reject: (error) => {
        if (entry.settled) {
          return;
        }
        entry.settled = true;
        options.signal.removeEventListener("abort", entry.abortHandler);
        pendingBySessionId.delete(options.sessionId);
        reject(error);
      },
      abortHandler: () => {
        entry.reject(new Error("Pending user input request was aborted."));
      },
    };

    options.signal.addEventListener("abort", entry.abortHandler, {
      once: true,
    });
    pendingBySessionId.set(options.sessionId, entry);
  });
}

export function submitPendingClaudeChatUserInput(
  input: SubmitPendingToolRequestInput,
): { resolvedRequestId: string } {
  const entry = pendingBySessionId.get(input.sessionId);
  if (!entry || entry.settled) {
    throw new Error("No pending user input request.");
  }
  if (entry.request.requestId !== input.requestId) {
    throw new Error("Pending user input request ID mismatch.");
  }

  if (input.behavior === "deny") {
    entry.resolve({
      behavior: "deny",
      message: input.message?.trim() || defaultDenyMessage(entry.request),
      toolUseID: entry.request.toolUseId,
    });
    return { resolvedRequestId: entry.request.requestId };
  }

  if (entry.request.kind === "ask-user-question") {
    const answers = normalizeSubmittedAnswers(entry.request, input.answers);
    entry.resolve({
      behavior: "allow",
      updatedInput: {
        ...entry.rawInput,
        answers,
      },
      toolUseID: entry.request.toolUseId,
    });
    return { resolvedRequestId: entry.request.requestId };
  }

  entry.resolve({
    behavior: "allow",
    updatedInput: entry.rawInput,
    toolUseID: entry.request.toolUseId,
  });
  return { resolvedRequestId: entry.request.requestId };
}

export function clearPendingClaudeChatUserInput(sessionId: string): void {
  const entry = pendingBySessionId.get(sessionId);
  if (!entry) {
    return;
  }
  pendingBySessionId.delete(sessionId);
  if (!entry.settled) {
    entry.reject(new Error("Pending user input request was cleared."));
  }
}
