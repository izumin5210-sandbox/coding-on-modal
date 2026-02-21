import type { NextResponse } from "next/server";
import type { AuthUser } from "@/lib/auth-types";
import { verifySessionToken } from "@/server/auth/jwt";
import type { AppDb } from "@/server/db";
import { getEnv } from "@/server/env";
import { getAuthUserById } from "@/server/users/store";

export const SESSION_COOKIE_NAME = "session_jwt";
export const OAUTH_STATE_COOKIE_NAME = "oauth_state";
export const OAUTH_CODE_VERIFIER_COOKIE_NAME = "oauth_code_verifier";

export class AuthError extends Error {
  constructor(
    message: string,
    readonly statusCode = 401,
  ) {
    super(message);
  }
}

function parseCookies(request: Request): Map<string, string> {
  const map = new Map<string, string>();
  const raw = request.headers.get("cookie");
  if (!raw) {
    return map;
  }

  for (const part of raw.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (!key || rest.length === 0) {
      continue;
    }
    map.set(key, decodeURIComponent(rest.join("=")));
  }

  return map;
}

function isSecureCookie(): boolean {
  return process.env.NODE_ENV === "production";
}

export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: getEnv().AUTH_JWT_MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export function setOauthCookies(
  response: NextResponse,
  input: { state: string; codeVerifier: string },
): void {
  response.cookies.set({
    name: OAUTH_STATE_COOKIE_NAME,
    value: input.state,
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });
  response.cookies.set({
    name: OAUTH_CODE_VERIFIER_COOKIE_NAME,
    value: input.codeVerifier,
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });
}

export function clearOauthCookies(response: NextResponse): void {
  for (const name of [
    OAUTH_STATE_COOKIE_NAME,
    OAUTH_CODE_VERIFIER_COOKIE_NAME,
  ]) {
    response.cookies.set({
      name,
      value: "",
      httpOnly: true,
      secure: isSecureCookie(),
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }
}

export function readOauthCookies(request: Request): {
  state?: string;
  codeVerifier?: string;
} {
  const cookies = parseCookies(request);
  return {
    state: cookies.get(OAUTH_STATE_COOKIE_NAME),
    codeVerifier: cookies.get(OAUTH_CODE_VERIFIER_COOKIE_NAME),
  };
}

export function getSessionUserIdFromRequest(request: Request): string | null {
  const cookies = parseCookies(request);
  const rawToken = cookies.get(SESSION_COOKIE_NAME);
  if (!rawToken) {
    return null;
  }

  const claims = verifySessionToken(rawToken);
  return claims?.sub ?? null;
}

export function getAuthenticatedUser(
  db: AppDb,
  request: Request,
): AuthUser | null {
  const userId = getSessionUserIdFromRequest(request);
  if (!userId) {
    return null;
  }
  return getAuthUserById(db, userId);
}

export function requireAuthenticatedUser(
  db: AppDb,
  request: Request,
): AuthUser {
  const user = getAuthenticatedUser(db, request);
  if (!user) {
    throw new AuthError("Authentication required", 401);
  }
  return user;
}
