export const ETSY_READ_RETRY_POLICY_VERSION = "1.0.0" as const;

const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_BASE_DELAY_MS = 250;
const DEFAULT_MAX_RETRY_DELAY_MS = 5_000;
const TRANSIENT_READ_STATUSES = new Set([429, 502, 503, 504]);

type Sleep = (milliseconds: number) => Promise<void>;

export type EtsyRateLimitSnapshot = {
  limitPerSecond: number | null;
  remainingThisSecond: number | null;
  limitPerDay: number | null;
  remainingToday: number | null;
  retryAfterMs: number | null;
};

export type EtsyReadRetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxRetryDelayMs?: number;
  sleep?: Sleep;
  now?: () => number;
};

function nonNegativeNumber(value: string | null) {
  if (value == null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function nonNegativeInteger(value: string | null) {
  const parsed = nonNegativeNumber(value);
  return parsed !== null && Number.isSafeInteger(parsed) ? parsed : null;
}

export function parseRetryAfterMs(
  value: string | null,
  nowMs: number = Date.now()
) {
  if (value == null || value.trim() === "") return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds * 1_000);
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, timestamp - nowMs);
}

export function readEtsyRateLimitSnapshot(
  headers: Headers,
  nowMs: number = Date.now()
): EtsyRateLimitSnapshot {
  return {
    limitPerSecond: nonNegativeInteger(headers.get("x-limit-per-second")),
    remainingThisSecond: nonNegativeInteger(
      headers.get("x-remaining-this-second") ??
        // Etsy's public documentation currently contains this truncated spelling.
        headers.get("x-remaining-this-secon")
    ),
    limitPerDay: nonNegativeInteger(headers.get("x-limit-per-day")),
    remainingToday: nonNegativeInteger(headers.get("x-remaining-today")),
    retryAfterMs: parseRetryAfterMs(headers.get("retry-after"), nowMs)
  };
}

function methodOf(init?: RequestInit) {
  return (init?.method ?? "GET").trim().toUpperCase();
}

export function assertEtsyAutoRetryReadOnly(init?: RequestInit) {
  const method = methodOf(init);
  if (method !== "GET" && method !== "HEAD") {
    throw new Error(`ETSY_AUTO_RETRY_WRITE_FORBIDDEN:${method}`);
  }
}

function normalizedAttemptCount(value: number | undefined) {
  if (value == null) return DEFAULT_MAX_ATTEMPTS;
  if (!Number.isSafeInteger(value) || value < 1 || value > 3) {
    throw new Error("INVALID_ETSY_READ_RETRY_ATTEMPTS");
  }
  return value;
}

function normalizedDelay(value: number | undefined, fallback: number) {
  if (value == null) return fallback;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("INVALID_ETSY_READ_RETRY_DELAY");
  }
  return Math.floor(value);
}

function defaultSleep(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export async function fetchEtsyReadWithRetry(
  fetchImpl: typeof fetch,
  input: Parameters<typeof fetch>[0],
  init: RequestInit = {},
  options: EtsyReadRetryOptions = {}
) {
  assertEtsyAutoRetryReadOnly(init);

  const maxAttempts = normalizedAttemptCount(options.maxAttempts);
  const baseDelayMs = normalizedDelay(options.baseDelayMs, DEFAULT_BASE_DELAY_MS);
  const maxRetryDelayMs = normalizedDelay(
    options.maxRetryDelayMs,
    DEFAULT_MAX_RETRY_DELAY_MS
  );
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;

  let lastNetworkError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetchImpl(input, init);
    } catch (error) {
      lastNetworkError = error;
      if (attempt >= maxAttempts) throw error;
      const delayMs = Math.min(
        maxRetryDelayMs,
        baseDelayMs * 2 ** (attempt - 1)
      );
      if (delayMs > 0) await sleep(delayMs);
      continue;
    }

    if (!TRANSIENT_READ_STATUSES.has(response.status) || attempt >= maxAttempts) {
      return response;
    }

    const rateLimit = readEtsyRateLimitSnapshot(response.headers, now());
    const suggestedDelayMs =
      response.status === 429 && rateLimit.retryAfterMs !== null
        ? rateLimit.retryAfterMs
        : baseDelayMs * 2 ** (attempt - 1);

    // A long Retry-After commonly indicates a depleted daily quota. Do not hold a
    // serverless request open; fail closed and let the caller surface the 429.
    if (suggestedDelayMs > maxRetryDelayMs) return response;
    if (suggestedDelayMs > 0) await sleep(suggestedDelayMs);
  }

  if (lastNetworkError) throw lastNetworkError;
  throw new Error("ETSY_READ_RETRY_EXHAUSTED");
}
