import { createHash, randomBytes } from "node:crypto";
import { getEnv } from "@/server/env";

type GithubTokenResponse = {
  access_token: string;
  token_type: string;
  scope?: string;
  refresh_token?: string;
  expires_in?: number;
};

type GithubUserResponse = {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
};

type GithubEmailResponse = {
  email: string;
  verified: boolean;
  primary: boolean;
};

export type GithubIdentity = {
  id: string;
  login: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
};

export type GithubOAuthToken = {
  accessToken: string;
  tokenType: string;
  scope?: string;
  refreshToken?: string;
  expiresAt?: string;
};

function toBase64Url(value: Buffer): string {
  return value
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

export function createOauthState(): string {
  return toBase64Url(randomBytes(18));
}

export function createCodeVerifier(): string {
  return toBase64Url(randomBytes(48));
}

export function createCodeChallenge(codeVerifier: string): string {
  return toBase64Url(createHash("sha256").update(codeVerifier).digest());
}

export function getGithubAuthorizeUrl(input: {
  state: string;
  codeChallenge: string;
}): string {
  const env = getEnv();
  const url = new URL(env.GITHUB_OAUTH_AUTHORIZE_URL);
  url.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  url.searchParams.set("redirect_uri", env.GITHUB_OAUTH_CALLBACK_URL);
  url.searchParams.set("scope", "read:user user:email repo");
  url.searchParams.set("state", input.state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export async function exchangeCodeForGithubToken(input: {
  code: string;
  codeVerifier: string;
}): Promise<GithubOAuthToken> {
  const env = getEnv();
  const body = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    client_secret: env.GITHUB_CLIENT_SECRET,
    code: input.code,
    redirect_uri: env.GITHUB_OAUTH_CALLBACK_URL,
    code_verifier: input.codeVerifier,
  });

  const response = await fetch(env.GITHUB_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`GitHub token exchange failed (${response.status})`);
  }

  const payload = (await response.json()) as GithubTokenResponse & {
    error?: string;
    error_description?: string;
  };

  if (!payload.access_token) {
    const detail =
      payload.error_description ?? payload.error ?? "unknown error";
    throw new Error(`GitHub token exchange failed: ${detail}`);
  }

  const expiresAt =
    typeof payload.expires_in === "number" && payload.expires_in > 0
      ? new Date(Date.now() + payload.expires_in * 1000).toISOString()
      : undefined;

  return {
    accessToken: payload.access_token,
    tokenType: payload.token_type ?? "bearer",
    scope: payload.scope,
    refreshToken: payload.refresh_token,
    expiresAt,
  };
}

async function fetchGithubEmails(
  accessToken: string,
): Promise<string | undefined> {
  const env = getEnv();
  const response = await fetch(env.GITHUB_API_EMAILS_URL, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${accessToken}`,
      "x-github-api-version": "2022-11-28",
      "user-agent": "coding-on-modal-manager-app",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return undefined;
  }

  const emails = (await response.json()) as GithubEmailResponse[];
  const preferred = emails.find((item) => item.primary && item.verified);
  if (preferred) {
    return preferred.email;
  }

  return emails.find((item) => item.verified)?.email;
}

export async function fetchGithubIdentity(
  accessToken: string,
): Promise<GithubIdentity> {
  const env = getEnv();
  const response = await fetch(env.GITHUB_API_USER_URL, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${accessToken}`,
      "x-github-api-version": "2022-11-28",
      "user-agent": "coding-on-modal-manager-app",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`GitHub user fetch failed (${response.status})`);
  }

  const payload = (await response.json()) as GithubUserResponse;
  const fallbackEmail = payload.email ?? (await fetchGithubEmails(accessToken));

  return {
    id: String(payload.id),
    login: payload.login,
    name: payload.name ?? undefined,
    email: fallbackEmail ?? undefined,
    avatarUrl: payload.avatar_url || undefined,
  };
}
