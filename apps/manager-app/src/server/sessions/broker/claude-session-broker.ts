/**
 * Claude Session Broker - HTTP server running inside the Modal sandbox.
 *
 * Provides a durable bridge between the manager-app workflow and the
 * Claude Agent SDK V1 query() running locally in the sandbox.
 *
 * Endpoints:
 *   POST /chat/send    - Start a new Claude turn (SSE response)
 *   POST /chat/approve - Resume a pending approval (SSE response for remaining messages)
 *   GET  /chat/status  - Current broker state + pending input info
 *   GET  /chat/messages - Accumulated messages for the current turn
 *
 * State machine: idle → running → (done → idle | permission_request → waiting_for_approval)
 *                waiting_for_approval → (approve) → running → ...
 */

import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import {
  type PermissionResult,
  type PermissionUpdate,
  query,
  type SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BrokerState = "idle" | "running" | "waiting_for_approval";

type PendingApproval = {
  toolName: string;
  toolUseId: string;
  input: Record<string, unknown>;
  questions: PendingQuestion[] | null;
  suggestions?: PermissionUpdate[];
  blockedPath?: string;
  decisionReason?: string;
  agentId?: string;
  resolve: (result: PermissionResult) => void;
};

type PendingQuestion = {
  header: string;
  question: string;
  multiSelect: boolean;
  options: { label: string; description: string }[];
};

type SSEWriter = {
  write: (event: string, data: unknown) => void;
  end: () => void;
};

// ---------------------------------------------------------------------------
// Globals (single-tenant per sandbox)
// ---------------------------------------------------------------------------

let brokerState: BrokerState = "idle";
let pendingApproval: PendingApproval | null = null;
let accumulatedMessages: SDKMessage[] = [];
let claudeSdkSessionId: string | undefined;

/**
 * Mutable SSE writer reference.
 * POST /chat/send sets it initially; on permission_request it's closed and
 * nulled out. POST /chat/approve sets a fresh writer so the remaining
 * query() messages flow to the new HTTP response.
 */
let activeSSE: SSEWriter | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function normalizeAskUserQuestions(
  input: Record<string, unknown>,
): PendingQuestion[] | null {
  const { questions } = input;
  if (!Array.isArray(questions)) return null;

  const normalized: PendingQuestion[] = [];
  for (const item of questions) {
    if (!isRecord(item) || !Array.isArray(item.options)) return null;
    const question = getString(item.question);
    const header = getString(item.header);
    if (!question || !header) return null;
    const options = item.options
      .map((opt) => {
        if (!isRecord(opt)) return null;
        const label = getString(opt.label);
        const description = getString(opt.description);
        if (!label || !description) return null;
        return { label, description };
      })
      .filter((opt): opt is { label: string; description: string } =>
        Boolean(opt),
      );
    if (options.length !== item.options.length || options.length < 2)
      return null;
    normalized.push({
      header,
      question,
      options,
      multiSelect: item.multiSelect === true,
    });
  }
  return normalized.length > 0 ? normalized : null;
}

function shouldInterceptUserFeedbackTool(toolName: string): boolean {
  const normalized = toolName.toLowerCase().replaceAll(/[_-]/g, "");
  return normalized === "askuserquestion" || normalized === "exitplanmode";
}

function createSSEWriter(res: ServerResponse): SSEWriter {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  return {
    write(event: string, data: unknown) {
      if (!res.writableEnded) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    },
    end() {
      if (!res.writableEnded) {
        res.end();
      }
    },
  };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function jsonResponse(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function buildPendingInputInfo(): Record<string, unknown> | null {
  if (!pendingApproval) return null;

  const normalizedToolName = pendingApproval.toolName
    .toLowerCase()
    .replaceAll(/[_-]/g, "");
  const kind =
    normalizedToolName === "askuserquestion"
      ? "ask-user-question"
      : "tool-approval";

  const base: Record<string, unknown> = {
    kind,
    toolName: pendingApproval.toolName,
    toolUseId: pendingApproval.toolUseId,
    input: pendingApproval.input,
    suggestions: pendingApproval.suggestions,
    blockedPath: pendingApproval.blockedPath,
    decisionReason: pendingApproval.decisionReason,
    agentId: pendingApproval.agentId,
  };

  if (kind === "ask-user-question" && pendingApproval.questions) {
    base.questions = pendingApproval.questions;
  }

  return base;
}

// ---------------------------------------------------------------------------
// Core: run a Claude turn via query()
// ---------------------------------------------------------------------------

async function runClaudeTurn(params: {
  prompt: string;
  cwd: string;
  maxTurns: number;
  resume?: string;
}): Promise<void> {
  brokerState = "running";
  accumulatedMessages = [];

  const canUseTool = async (
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
    if (!shouldInterceptUserFeedbackTool(toolName)) {
      return {
        behavior: "allow",
        updatedInput: toolInput,
        toolUseID: sdkOptions.toolUseID,
      };
    }

    brokerState = "waiting_for_approval";
    const questions = normalizeAskUserQuestions(toolInput);

    const pendingInfo = {
      toolName,
      toolUseId: sdkOptions.toolUseID,
      input: toolInput,
      questions,
      suggestions: sdkOptions.suggestions,
      blockedPath: sdkOptions.blockedPath,
      decisionReason: sdkOptions.decisionReason,
      agentId: sdkOptions.agentID,
    };

    // End current SSE segment with a permission_request event
    activeSSE?.write("permission_request", pendingInfo);
    activeSSE?.end();
    activeSSE = null;

    // Wait for POST /chat/approve to resolve this promise
    return new Promise<PermissionResult>((resolve) => {
      pendingApproval = {
        toolName,
        toolUseId: sdkOptions.toolUseID,
        input: toolInput,
        questions,
        suggestions: sdkOptions.suggestions,
        blockedPath: sdkOptions.blockedPath,
        decisionReason: sdkOptions.decisionReason,
        agentId: sdkOptions.agentID,
        resolve,
      };
    });
  };

  try {
    for await (const message of query({
      prompt: params.prompt,
      options: {
        cwd: params.cwd,
        maxTurns: params.maxTurns,
        resume: params.resume ?? claudeSdkSessionId,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        canUseTool,
      },
    })) {
      accumulatedMessages.push(message);
      if (!claudeSdkSessionId && typeof message.session_id === "string") {
        claudeSdkSessionId = message.session_id;
      }
      activeSSE?.write("message", message);
    }

    brokerState = "idle";
    activeSSE?.write("done", { claudeSdkSessionId });
    activeSSE?.end();
    activeSSE = null;
  } catch (error) {
    brokerState = "idle";
    activeSSE?.write("error", {
      message: error instanceof Error ? error.message : String(error),
      claudeSdkSessionId,
    });
    activeSSE?.end();
    activeSSE = null;
  }
}

// ---------------------------------------------------------------------------
// Endpoint handlers
// ---------------------------------------------------------------------------

async function handleChatSend(req: IncomingMessage, res: ServerResponse) {
  if (brokerState !== "idle") {
    jsonResponse(res, 409, {
      error: `Broker is ${brokerState}, cannot start new turn`,
    });
    return;
  }

  const body = JSON.parse(await readBody(req)) as {
    prompt: string;
    cwd: string;
    maxTurns: number;
    resume?: string;
  };

  activeSSE = createSSEWriter(res);
  // runClaudeTurn runs in the background; SSE lifecycle drives the response
  void runClaudeTurn(body);
}

async function handleChatApprove(req: IncomingMessage, res: ServerResponse) {
  if (brokerState !== "waiting_for_approval" || !pendingApproval) {
    jsonResponse(res, 409, { error: "No pending approval" });
    return;
  }

  const body = JSON.parse(await readBody(req)) as {
    behavior: "allow" | "deny";
    message?: string;
    answers?: Record<string, string | string[]>;
    updatedInput?: Record<string, unknown>;
  };

  const approval = pendingApproval;
  pendingApproval = null;
  brokerState = "running";

  // Set up new SSE writer for the remaining messages from the query() generator
  activeSSE = createSSEWriter(res);

  if (body.behavior === "deny") {
    approval.resolve({
      behavior: "deny",
      message:
        body.message ?? `User denied tool execution: ${approval.toolName}`,
      toolUseID: approval.toolUseId,
    });
  } else {
    const updatedInput =
      body.updatedInput ??
      (body.answers
        ? { ...approval.input, answers: body.answers }
        : approval.input);
    approval.resolve({
      behavior: "allow",
      updatedInput,
      toolUseID: approval.toolUseId,
    });
  }

  // After resolving, query() continues in the runClaudeTurn loop.
  // Messages will be written to the new activeSSE.
  // The SSE will be closed when query() finishes or hits another permission_request.
}

function handleChatStatus(_req: IncomingMessage, res: ServerResponse) {
  jsonResponse(res, 200, {
    state: brokerState,
    claudeSdkSessionId: claudeSdkSessionId ?? null,
    pendingInput: buildPendingInputInfo(),
    messageCount: accumulatedMessages.length,
  });
}

function handleChatMessages(_req: IncomingMessage, res: ServerResponse) {
  jsonResponse(res, 200, {
    messages: accumulatedMessages,
    claudeSdkSessionId: claudeSdkSessionId ?? null,
  });
}

// ---------------------------------------------------------------------------
// HTTP router
// ---------------------------------------------------------------------------

function parseUrl(req: IncomingMessage): { pathname: string; method: string } {
  const url = new URL(req.url ?? "/", "http://localhost");
  return { pathname: url.pathname, method: req.method ?? "GET" };
}

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const { pathname, method } = parseUrl(req);

  try {
    if (method === "POST" && pathname === "/chat/send") {
      await handleChatSend(req, res);
      return;
    }
    if (method === "POST" && pathname === "/chat/approve") {
      await handleChatApprove(req, res);
      return;
    }
    if (method === "GET" && pathname === "/chat/status") {
      handleChatStatus(req, res);
      return;
    }
    if (method === "GET" && pathname === "/chat/messages") {
      handleChatMessages(req, res);
      return;
    }
    if (method === "GET" && pathname === "/health") {
      jsonResponse(res, 200, { ok: true });
      return;
    }
    jsonResponse(res, 404, { error: "Not found" });
  } catch (error) {
    console.error("[broker] Request error:", error);
    if (!res.headersSent) {
      jsonResponse(res, 500, {
        error: error instanceof Error ? error.message : "Internal error",
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Server bootstrap
// ---------------------------------------------------------------------------

const PORT = Number(process.env.SESSION_BROKER_PORT) || 8765;

const server = createServer((req, res) => {
  void handleRequest(req, res);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[broker] Claude Session Broker listening on port ${PORT}`);
});

process.on("SIGTERM", () => {
  console.log("[broker] Received SIGTERM, shutting down...");
  server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  console.log("[broker] Received SIGINT, shutting down...");
  server.close(() => process.exit(0));
});
