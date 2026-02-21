import { NextResponse } from "next/server";
import {
  exchangeCodeForGithubToken,
  fetchGithubIdentity,
} from "@/server/auth/github";
import { createSessionToken } from "@/server/auth/jwt";
import {
  clearOauthCookies,
  readOauthCookies,
  setSessionCookie,
} from "@/server/auth/session";
import { encryptToken } from "@/server/crypto/token";
import { getDb } from "@/server/db";
import {
  upsertGithubCredential,
  upsertGithubIdentity,
} from "@/server/users/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildRedirectUrl(baseUrl: string, error?: string): URL {
  const url = new URL("/", baseUrl);
  if (error) {
    url.searchParams.set("authError", error);
  }
  return url;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const stateParam = requestUrl.searchParams.get("state");
  const code = requestUrl.searchParams.get("code");
  const oauthError = requestUrl.searchParams.get("error");

  if (oauthError) {
    const response = NextResponse.redirect(
      buildRedirectUrl(request.url, oauthError),
    );
    clearOauthCookies(response);
    return response;
  }

  if (!stateParam || !code) {
    const response = NextResponse.redirect(
      buildRedirectUrl(request.url, "missing_oauth_params"),
    );
    clearOauthCookies(response);
    return response;
  }

  const { state, codeVerifier } = readOauthCookies(request);
  if (!state || !codeVerifier || state !== stateParam) {
    const response = NextResponse.redirect(
      buildRedirectUrl(request.url, "invalid_oauth_state"),
    );
    clearOauthCookies(response);
    return response;
  }

  try {
    const token = await exchangeCodeForGithubToken({
      code,
      codeVerifier,
    });
    const identity = await fetchGithubIdentity(token.accessToken);
    const db = getDb();
    const user = upsertGithubIdentity(db, {
      githubUserId: identity.id,
      login: identity.login,
      name: identity.name,
      email: identity.email,
      avatarUrl: identity.avatarUrl,
    });

    upsertGithubCredential(db, user.githubAccountId, {
      accessTokenEncrypted: encryptToken(token.accessToken),
      refreshTokenEncrypted: token.refreshToken
        ? encryptToken(token.refreshToken)
        : undefined,
      tokenType: token.tokenType,
      scope: token.scope,
      expiresAt: token.expiresAt,
    });

    const sessionToken = createSessionToken({
      userId: user.userId,
      githubLogin: user.login,
    });

    const response = NextResponse.redirect(new URL("/", request.url));
    clearOauthCookies(response);
    setSessionCookie(response, sessionToken);
    return response;
  } catch {
    const response = NextResponse.redirect(
      buildRedirectUrl(request.url, "github_callback_failed"),
    );
    clearOauthCookies(response);
    return response;
  }
}
