import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

export const execRequestSchema = z.object({
  cmd: z.string().min(1, "cmd must not be empty"),
  cwd: z.string().optional(),
  pty: z.boolean().optional(),
});

export const agentRequestSchema = z.object({
  prompt: z.string().min(1, "prompt must not be empty"),
  cwd: z.string().optional(),
  maxTurns: z.number().int().min(1).max(20).optional(),
});

export const execResultSchema = z.object({
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number().int(),
});

export const errorResponseSchema = z.object({
  error: z.object({
    message: z.string(),
  }),
});

export const execResponseSchema = z.object({
  result: execResultSchema,
});

export const agentResponseSchema = z.object({
  events: z.array(z.unknown()),
});

export const healthzResponseSchema = z.object({
  ok: z.literal(true),
  service: z.literal("session-runtime-api"),
});

export type ExecRequest = z.infer<typeof execRequestSchema>;
export type AgentRequest = z.infer<typeof agentRequestSchema>;
export type ExecResult = z.infer<typeof execResultSchema>;
export type AgentResponse = {
  events: SDKMessage[];
};
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
