import { createHash } from "node:crypto";

export const CANDIDATE_FINGERPRINT_SCHEMA_VERSION = "candidate-fingerprint.v1" as const;
export type CandidateFingerprintScope = "CANDIDATE" | "LISTING";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function normalize(value: unknown): JsonValue {
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("UNSUPPORTED_FINGERPRINT_NUMBER");
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value === "string") return value.normalize("NFC").trim();
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, child]) => [key, normalize(child)])
    );
  }
  throw new Error("UNSUPPORTED_FINGERPRINT_VALUE");
}

export function canonicalizeFingerprintPayload(payload: Record<string, unknown>) {
  return normalize(payload);
}

export function fingerprintCanonicalPayload(
  payload: Record<string, unknown>,
  scope: CandidateFingerprintScope
) {
  const envelope = {
    schemaVersion: CANDIDATE_FINGERPRINT_SCHEMA_VERSION,
    scope,
    payload: canonicalizeFingerprintPayload(payload)
  };
  const canonicalJson = JSON.stringify(envelope);
  return {
    schemaVersion: CANDIDATE_FINGERPRINT_SCHEMA_VERSION,
    scope,
    canonicalJson,
    fingerprint: createHash("sha256").update(canonicalJson, "utf8").digest("hex")
  } as const;
}

export function createCandidateFingerprint(payload: Record<string, unknown>) {
  return fingerprintCanonicalPayload(payload, "CANDIDATE").fingerprint;
}

export function createListingFingerprint(payload: Record<string, unknown>) {
  return fingerprintCanonicalPayload(payload, "LISTING").fingerprint;
}
