/**
 * Returns the broker JavaScript source code to be written to the sandbox.
 * This is plain CJS JavaScript that runs under Node.js with
 * NODE_PATH=/opt/claude-code-sdk/node_modules.
 */
export function getBrokerScript(): string {
  // biome-ignore format: embedded script
  return `
"use strict";

const http = require("node:http");
const { query } = require("@anthropic-ai/claude-agent-sdk");

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let brokerState = "idle"; // idle | running | waiting_for_approval
let pendingApproval = null;
let accumulatedMessages = [];
let claudeSdkSessionId = undefined;
let activeSSE = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRecord(value) {
  return typeof value === "object" && value !== null;
}

function getString(value) {
  return typeof value === "string" ? value : undefined;
}

function normalizeAskUserQuestions(input) {
  const { questions } = input;
  if (!Array.isArray(questions)) return null;
  const normalized = [];
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
      .filter(Boolean);
    if (options.length !== item.options.length || options.length < 2) return null;
    normalized.push({ header, question, options, multiSelect: item.multiSelect === true });
  }
  return normalized.length > 0 ? normalized : null;
}

function shouldInterceptUserFeedbackTool(toolName) {
  const normalized = toolName.toLowerCase().replaceAll(/[_-]/g, "");
  return normalized === "askuserquestion" || normalized === "exitplanmode";
}

function createSSEWriter(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });
  return {
    write(event, data) {
      if (!res.writableEnded) {
        res.write("event: " + event + "\\ndata: " + JSON.stringify(data) + "\\n\\n");
      }
    },
    end() {
      if (!res.writableEnded) {
        res.end();
      }
    },
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function jsonResponse(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function buildPendingInputInfo() {
  if (!pendingApproval) return null;
  const normalizedToolName = pendingApproval.toolName.toLowerCase().replaceAll(/[_-]/g, "");
  const kind = normalizedToolName === "askuserquestion" ? "ask-user-question" : "tool-approval";
  const base = {
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

async function runClaudeTurn(params) {
  brokerState = "running";
  accumulatedMessages = [];

  const canUseTool = async (toolName, toolInput, sdkOptions) => {
    if (!shouldInterceptUserFeedbackTool(toolName)) {
      return { behavior: "allow", updatedInput: toolInput, toolUseID: sdkOptions.toolUseID };
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

    // End current SSE segment with permission_request
    if (activeSSE) {
      activeSSE.write("permission_request", pendingInfo);
      activeSSE.end();
      activeSSE = null;
    }

    // Wait for POST /chat/approve
    return new Promise((resolve) => {
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
        resume: params.resume || claudeSdkSessionId,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        canUseTool,
      },
    })) {
      accumulatedMessages.push(message);
      if (!claudeSdkSessionId && typeof message.session_id === "string") {
        claudeSdkSessionId = message.session_id;
      }
      if (activeSSE) {
        activeSSE.write("message", message);
      }
    }

    brokerState = "idle";
    if (activeSSE) {
      activeSSE.write("done", { claudeSdkSessionId });
      activeSSE.end();
      activeSSE = null;
    }
  } catch (error) {
    brokerState = "idle";
    if (activeSSE) {
      activeSSE.write("error", {
        message: error instanceof Error ? error.message : String(error),
        claudeSdkSessionId,
      });
      activeSSE.end();
      activeSSE = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

async function handleChatSend(req, res) {
  if (brokerState !== "idle") {
    jsonResponse(res, 409, { error: "Broker is " + brokerState + ", cannot start new turn" });
    return;
  }
  const body = JSON.parse(await readBody(req));
  activeSSE = createSSEWriter(res);
  void runClaudeTurn(body);
}

async function handleChatApprove(req, res) {
  if (brokerState !== "waiting_for_approval" || !pendingApproval) {
    jsonResponse(res, 409, { error: "No pending approval" });
    return;
  }
  const body = JSON.parse(await readBody(req));
  const approval = pendingApproval;
  pendingApproval = null;
  brokerState = "running";

  // New SSE writer for remaining messages
  activeSSE = createSSEWriter(res);

  if (body.behavior === "deny") {
    approval.resolve({
      behavior: "deny",
      message: body.message || ("User denied tool execution: " + approval.toolName),
      toolUseID: approval.toolUseId,
    });
  } else {
    const updatedInput = body.updatedInput || (body.answers
      ? Object.assign({}, approval.input, { answers: body.answers })
      : approval.input);
    approval.resolve({
      behavior: "allow",
      updatedInput,
      toolUseID: approval.toolUseId,
    });
  }
}

function handleChatStatus(req, res) {
  jsonResponse(res, 200, {
    state: brokerState,
    claudeSdkSessionId: claudeSdkSessionId || null,
    pendingInput: buildPendingInputInfo(),
    messageCount: accumulatedMessages.length,
  });
}

function handleChatMessages(req, res) {
  jsonResponse(res, 200, {
    messages: accumulatedMessages,
    claudeSdkSessionId: claudeSdkSessionId || null,
  });
}

// ---------------------------------------------------------------------------
// HTTP router
// ---------------------------------------------------------------------------

async function handleRequest(req, res) {
  const url = new URL(req.url || "/", "http://localhost");
  const pathname = url.pathname;
  const method = req.method || "GET";

  try {
    if (method === "POST" && pathname === "/chat/send") { await handleChatSend(req, res); return; }
    if (method === "POST" && pathname === "/chat/approve") { await handleChatApprove(req, res); return; }
    if (method === "GET" && pathname === "/chat/status") { handleChatStatus(req, res); return; }
    if (method === "GET" && pathname === "/chat/messages") { handleChatMessages(req, res); return; }
    if (method === "GET" && pathname === "/health") { jsonResponse(res, 200, { ok: true }); return; }
    jsonResponse(res, 404, { error: "Not found" });
  } catch (error) {
    console.error("[broker] Request error:", error);
    if (!res.headersSent) {
      jsonResponse(res, 500, { error: error instanceof Error ? error.message : "Internal error" });
    }
  }
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

const PORT = Number(process.env.SESSION_BROKER_PORT) || 8765;
const server = http.createServer((req, res) => { void handleRequest(req, res); });
server.listen(PORT, "0.0.0.0", () => {
  console.log("[broker] Claude Session Broker listening on port " + PORT);
});

process.on("SIGTERM", () => { console.log("[broker] SIGTERM"); server.close(() => process.exit(0)); });
process.on("SIGINT", () => { console.log("[broker] SIGINT"); server.close(() => process.exit(0)); });
`.trim();
}
