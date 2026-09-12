const EXACT_DRAFT_LISTING_URL_SUFFIX = "/v3/application/listings/4573789186";

export function normalizePdtBpsc001C09EtsyDescriptionTransport(value: unknown) {
  if (typeof value !== "string") return value;
  return value
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&apos;/gi, "'");
}

function requestUrl(input: string | URL | Request) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function requestMethod(input: string | URL | Request, init?: RequestInit) {
  return (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
}

function isExactDraftCoreRead(input: string | URL | Request, init?: RequestInit) {
  const url = new URL(requestUrl(input));
  return requestMethod(input, init) === "GET" && url.pathname.endsWith(EXACT_DRAFT_LISTING_URL_SUFFIX);
}

export function pdtBpsc001C09RecoveryEtsyFetch(baseFetch: typeof fetch = fetch): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const response = await baseFetch(input, init);
    if (!response.ok || !isExactDraftCoreRead(input, init)) return response;

    const text = await response.text();
    let payload: unknown;
    try { payload = text ? JSON.parse(text) : null; }
    catch { return new Response(text, response); }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return new Response(text, response);
    }

    const record = payload as Record<string, unknown>;
    const normalized = normalizePdtBpsc001C09EtsyDescriptionTransport(record.description);
    if (normalized === record.description) return new Response(text, response);

    const headers = new Headers(response.headers);
    headers.delete("content-length");
    headers.delete("content-encoding");
    return new Response(JSON.stringify({ ...record, description: normalized }), {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }) as typeof fetch;
}
