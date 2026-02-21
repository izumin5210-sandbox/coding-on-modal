import { NextResponse } from "next/server";
import {
  createCodeChallenge,
  createCodeVerifier,
  createOauthState,
  getGithubAuthorizeUrl,
} from "@/server/auth/github";
import { setOauthCookies } from "@/server/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const state = createOauthState();
  const codeVerifier = createCodeVerifier();
  const codeChallenge = createCodeChallenge(codeVerifier);
  const authorizeUrl = getGithubAuthorizeUrl({
    state,
    codeChallenge,
  });

  const response = NextResponse.redirect(authorizeUrl);
  setOauthCookies(response, { state, codeVerifier });
  return response;
}
