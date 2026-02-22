import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { runAgentQuery } from "./lib/agent.js";
import { executeShell } from "./lib/exec.js";
import { CLAUDE_TOKEN_HEADER } from "./constants.js";
import {
  agentResponseSchema,
  agentRequestSchema,
  errorResponseSchema,
  execRequestSchema,
  execResponseSchema,
  healthzResponseSchema,
} from "./types.js";

export function createSessionRuntimeApiApp() {
  const rpcApp = new Hono()
    .post(
      "/exec",
      zValidator("json", execRequestSchema),
      async (c) => {
        try {
          const input = c.req.valid("json");
          const result = await executeShell(input);
          return c.json(execResponseSchema.parse({ result }), 200 as const);
        } catch (error) {
          return c.json(
            errorResponseSchema.parse({
              error: {
                message: error instanceof Error ? error.message : "Internal error",
              },
            }),
            500 as const,
          );
        }
      },
    )
    .post(
      "/agent",
      zValidator("json", agentRequestSchema),
      async (c) => {
        const claudeToken = c.req.header(CLAUDE_TOKEN_HEADER)?.trim();
        if (!claudeToken) {
          return c.json(
            errorResponseSchema.parse({
              error: { message: "Missing Claude token header" },
            }),
            401 as const,
          );
        }

        try {
          const input = c.req.valid("json");
          const result = await runAgentQuery(input, claudeToken);
          return c.json(agentResponseSchema.parse(result), 200 as const);
        } catch (error) {
          return c.json(
            errorResponseSchema.parse({
              error: {
                message: error instanceof Error ? error.message : "Internal error",
              },
            }),
            500 as const,
          );
        }
      },
    );

  const app = new Hono()
    .get("/healthz", (c) =>
      c.json(
        healthzResponseSchema.parse({
          ok: true,
          service: "session-runtime-api",
        }),
        200 as const,
      ),
    )
    .route("/rpc", rpcApp);

  return app;
}

export const app = createSessionRuntimeApiApp();
export type SessionRuntimeAppType = typeof app;
