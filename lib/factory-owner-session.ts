import { authorizeEtsyOperatorRequest } from "./etsy-operator-auth";

export const OWNER_COOKIE = "__Host-factory-owner";
const MAX_AGE = 60 * 60 * 12;
const encoder = new TextEncoder();
function key() {
  const secret = process.env.ETSY_PLAN_EDITOR_TOKEN?.trim() ?? "";
  if (secret.length < 32 || secret.length > 512) throw Error("FACTORY_OWNER_AUTH_UNAVAILABLE");
  return secret;
}
function bytesToHex(bytes: Uint8Array) { return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join(""); }
async function signature(payload: string, secret = key()) {
  const k = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToHex(new Uint8Array(await crypto.subtle.sign("HMAC", k, encoder.encode(payload))));
}
export async function issueOwnerSession() {
  const expires = Math.floor(Date.now() / 1000) + MAX_AGE;
  const payload = `factory-owner.v1.${expires}`;
  return { value: `${payload}.${await signature(payload)}`, maxAge: MAX_AGE };
}
export async function hasOwnerSession(request: Pick<Request, "headers">) {
  try {
    const raw = request.headers.get("cookie")?.split(";").map(x => x.trim()).find(x => x.startsWith(OWNER_COOKIE + "="))?.slice(OWNER_COOKIE.length + 1);
    if (!raw || raw.length > 256) return false;
    const parts = raw.split(".");
    if (parts.length !== 4 || parts[0] !== "factory-owner" || parts[1] !== "v1" || !/^\d{10}$/.test(parts[2]) || !/^[0-9a-f]{64}$/.test(parts[3])) return false;
    const expires = Number(parts[2]);
    const now = Math.floor(Date.now() / 1000);
    if (expires <= now || expires > now + MAX_AGE) return false;
    const expected = await signature(parts.slice(0, 3).join("."));
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ parts[3].charCodeAt(i);
    return diff === 0;
  } catch { return false; }
}
export function validSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}
export async function authorizeFactoryMutation(request: Request) {
  if (await hasOwnerSession(request)) return validSameOrigin(request) ? null : "FACTORY_ORIGIN_DENIED";
  const bearer = request.headers.get("authorization");
  if (bearer?.startsWith("Bearer ")) return await authorizeEtsyOperatorRequest(request, "plan", false);
  return "FACTORY_OWNER_SESSION_REQUIRED";
}


// A read-only session never authorizes Factory writes or Etsy mutations.
// It is signed with a separate read token, not the owner/editor token.
export const READER_COOKIE = "__Host-factory-reader";
function readerKey() {
  const secret = process.env.ETSY_OPERATOR_READ_TOKEN?.trim() ?? "";
  if (secret.length < 32 || secret.length > 512) throw Error("FACTORY_READER_AUTH_UNAVAILABLE");
  return secret;
}
export async function issueReaderSession() {
  const expires = Math.floor(Date.now() / 1000) + MAX_AGE;
  const payload = "factory-reader.v1." + expires;
  return { value: payload + "." + await signature(payload, readerKey()), maxAge: MAX_AGE };
}
export async function hasReaderSession(request: Pick<Request, "headers">) {
  try {
    const raw = request.headers.get("cookie")?.split(";").map(x => x.trim())
      .find(x => x.startsWith(READER_COOKIE + "="))?.slice(READER_COOKIE.length + 1);
    if (!raw || raw.length > 256) return false;
    const parts = raw.split(".");
    if (parts.length !== 4 || parts[0] !== "factory-reader" || parts[1] !== "v1" ||
        !/^\d{10}$/.test(parts[2]) || !/^[0-9a-f]{64}$/.test(parts[3])) return false;
    const expires = Number(parts[2]);
    const now = Math.floor(Date.now() / 1000);
    if (expires <= now || expires > now + MAX_AGE) return false;
    const expected = await signature(parts.slice(0, 3).join("."), readerKey());
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ parts[3].charCodeAt(i);
    return diff === 0;
  } catch { return false; }
}
