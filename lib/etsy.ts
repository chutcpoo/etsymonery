import { createHash, randomBytes } from "node:crypto";

export const ETSY_SCOPES = [
  "listings_r",
  "listings_w",
  "shops_r",
  "transactions_r"
] as const;

function base64Url(input: Buffer) {
  return input
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function createPkcePair() {
  const verifier = base64Url(randomBytes(64));
  const challenge = base64Url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export function createOAuthState() {
  return base64Url(randomBytes(32));
}

export function getEtsyCredentials() {
  const keystring = process.env.ETSY_API_KEY?.trim();
  const sharedSecret = process.env.ETSY_SHARED_SECRET?.trim();

  return {
    keystring,
    sharedSecret,
    configured: Boolean(keystring && sharedSecret)
  };
}

export function getEtsyRedirectUri(requestUrl: string) {
  const configured = process.env.ETSY_REDIRECT_URI?.trim();
  if (configured) return configured;

  const origin = new URL(requestUrl).origin;
  return `${origin}/api/etsy/oauth/callback`;
}

export function etsyApiHeaders(accessToken?: string) {
  const { keystring, sharedSecret } = getEtsyCredentials();

  if (!keystring || !sharedSecret) {
    throw new Error("ETSY_API_CREDENTIALS_NOT_CONFIGURED");
  }

  const headers: Record<string, string> = {
    "x-api-key": `${keystring}:${sharedSecret}`,
    "content-type": "application/json"
  };

  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  return headers;
}
