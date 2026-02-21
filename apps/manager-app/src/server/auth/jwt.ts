import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/server/env";

type SessionTokenClaims = {
  sub: string;
  login: string;
  iat: number;
  exp: number;
  jti: string;
};

const JWT_ALG = "HS256";

function toBase64Url(value: Buffer | string): string {
  return Buffer.from(value)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string): Buffer {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padLength = (4 - (base64.length % 4)) % 4;
  return Buffer.from(base64 + "=".repeat(padLength), "base64");
}

function signMessage(message: string): string {
  const secret = getEnv().AUTH_JWT_SECRET;
  return toBase64Url(createHmac("sha256", secret).update(message).digest());
}

function parsePayload(payload: string): SessionTokenClaims | null {
  try {
    return JSON.parse(
      fromBase64Url(payload).toString("utf8"),
    ) as SessionTokenClaims;
  } catch {
    return null;
  }
}

export function createSessionToken(input: {
  userId: string;
  githubLogin: string;
}): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const claims: SessionTokenClaims = {
    sub: input.userId,
    login: input.githubLogin,
    iat: nowSeconds,
    exp: nowSeconds + getEnv().AUTH_JWT_MAX_AGE_SECONDS,
    jti: randomUUID(),
  };

  const header = toBase64Url(
    JSON.stringify({
      alg: JWT_ALG,
      typ: "JWT",
    }),
  );
  const payload = toBase64Url(JSON.stringify(claims));
  const signature = signMessage(`${header}.${payload}`);
  return `${header}.${payload}.${signature}`;
}

export function verifySessionToken(token: string): SessionTokenClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [header, payload, signature] = parts;
  const expectedSignature = signMessage(`${header}.${payload}`);

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  const claims = parsePayload(payload);
  if (!claims || claims.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  return claims;
}
