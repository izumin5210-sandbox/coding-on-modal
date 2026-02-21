import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const envSchema = z.object({
  MODAL_TOKEN_ID: z.string().min(1, "MODAL_TOKEN_ID is required"),
  MODAL_TOKEN_SECRET: z.string().min(1, "MODAL_TOKEN_SECRET is required"),
  AUTH_JWT_SECRET: z
    .string()
    .min(32, "AUTH_JWT_SECRET must be at least 32 chars"),
  AUTH_JWT_MAX_AGE_SECONDS: z.coerce
    .number()
    .int()
    .min(300)
    .max(60 * 60 * 24 * 30)
    .default(60 * 60 * 12),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .min(1, "TOKEN_ENCRYPTION_KEY is required")
    .refine((value) => {
      const decoded = Buffer.from(value, "base64");
      return decoded.length === 32;
    }, "TOKEN_ENCRYPTION_KEY must be base64 encoded 32-byte key"),
  GITHUB_CLIENT_ID: z.string().min(1, "GITHUB_CLIENT_ID is required"),
  GITHUB_CLIENT_SECRET: z.string().min(1, "GITHUB_CLIENT_SECRET is required"),
  GITHUB_OAUTH_CALLBACK_URL: z
    .string()
    .url("GITHUB_OAUTH_CALLBACK_URL must be a valid URL"),
  GITHUB_OAUTH_AUTHORIZE_URL: z
    .string()
    .url()
    .default("https://github.com/login/oauth/authorize"),
  GITHUB_OAUTH_TOKEN_URL: z
    .string()
    .url()
    .default("https://github.com/login/oauth/access_token"),
  GITHUB_API_USER_URL: z.string().url().default("https://api.github.com/user"),
  GITHUB_API_EMAILS_URL: z
    .string()
    .url()
    .default("https://api.github.com/user/emails"),
  MODAL_ENVIRONMENT: z.string().min(1).optional(),
  MODAL_APP_NAME: z.string().default("coding-on-modal-session-manager"),
  DEFAULT_REPO_URL: z
    .string()
    .url()
    .default("https://github.com/izumin5210-sandbox/coding-on-modal"),
  DEFAULT_REPO_REF: z.string().default("main"),
  SANDBOX_TIMEOUT_MINUTES: z.coerce.number().int().min(5).max(240).default(60),
  SANDBOX_IDLE_TIMEOUT_MINUTES: z.coerce
    .number()
    .int()
    .min(1)
    .max(240)
    .default(30),
  AGENT_MAX_TURNS: z.coerce.number().int().min(1).max(20).default(8),
  SESSION_DB_PATH: z.string().optional(),
});

type RuntimeEnv = z.infer<typeof envSchema> & {
  SESSION_DB_PATH: string;
};

let cachedEnv: RuntimeEnv | null = null;

function resolveDefaultDbPath(): string {
  const cwd = process.cwd();
  const appDir = existsSync(path.join(cwd, "src"))
    ? cwd
    : path.join(cwd, "apps", "manager-app");
  return path.join(appDir, "data", "manager.db");
}

export function getEnv(): RuntimeEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${message}`);
  }

  cachedEnv = {
    ...parsed.data,
    SESSION_DB_PATH: parsed.data.SESSION_DB_PATH ?? resolveDefaultDbPath(),
  };

  return cachedEnv;
}
