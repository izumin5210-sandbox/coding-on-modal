export const CLAUDE_TOKEN_HEADER = "x-session-runtime-claude-token";

export {
  agentResponseSchema,
  agentRequestSchema,
  errorResponseSchema,
  execRequestSchema,
  execResponseSchema,
  execResultSchema,
  healthzResponseSchema,
  type AgentResponse,
  type ErrorResponse,
  type AgentRequest,
  type ExecRequest,
  type ExecResult,
} from "./types.js";
