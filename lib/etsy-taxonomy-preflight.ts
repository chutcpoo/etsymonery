import { timingSafeEqual } from "node:crypto";
import { etsyApiHeaders } from "./etsy";
import { fetchEtsyReadWithRetry } from "./etsy-http";

// Read-only, operator-authenticated provider evidence. Never a Draft/Publish route.
export const P01_TAXONOMY_PREFLIGHT_VERSION = "1.0.0" as const;
const HEADERS = { "cache-control": "no-store" };
const BASE = "https://openapi.etsy.com/v3/application/seller-taxonomy/nodes";
const MAX_NODES = 20000;
const MAX_SEARCH_RESULTS = 40;
const MAX_PROPERTIES = 100;
const MAX_VALUES = 80;

type RecordObject = Record<string, unknown>;
type TaxonomyNode = { taxonomy_id: number; name: string; path: string[]; leaf: boolean };
type Dependencies = { fetchImpl?: typeof fetch };

function isObject(value: unknown): value is RecordObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function output(status: "PASS" | "BLOCKED", code: number, fields: RecordObject) {
  return Response.json({
    status, mode: "READ_ONLY", source: "etsy-open-api-v3-seller-taxonomy",
    ETSY_WRITE_COUNT: 0, etsyMutationPerformed: false, ...fields
  }, { status: code, headers: HEADERS });
}

function blocked(error: string, code: number) {
  return output("BLOCKED", code, { error });
}

function equalSecrets(left: string, right: string) {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function authorize(request: Request): Response | null {
  const expected = process.env.ETSY_TAXONOMY_READ_TOKEN?.trim() ?? "";
  if (!expected) return blocked("ETSY_TAXONOMY_READ_AUTH_NOT_CONFIGURED", 503);
  const auth = request.headers.get("authorization") ?? "";
  const supplied = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!supplied || !equalSecrets(supplied, expected)) {
    return Response.json({
      status: "BLOCKED", mode: "READ_ONLY",
      error: "ETSY_TAXONOMY_READ_UNAUTHORIZED", ETSY_WRITE_COUNT: 0,
      etsyMutationPerformed: false
    }, { status: 401, headers: { ...HEADERS, "www-authenticate": "Bearer" } });
  }
  return null;
}

function collectNodes(value: unknown): TaxonomyNode[] {
  if (!isObject(value) || !Array.isArray(value.results)) {
    throw new Error("ETSY_TAXONOMY_INVALID_TREE");
  }
  const all: TaxonomyNode[] = [];
  const walk = (entries: unknown[], ancestors: string[], depth: number) => {
    if (depth > 20) throw new Error("ETSY_TAXONOMY_TREE_TOO_DEEP");
    for (const item of entries) {
      if (!isObject(item) || !Number.isSafeInteger(item.id) ||
        (item.id as number) <= 0 || typeof item.name !== "string" ||
        !item.name.trim() || (item.children !== undefined && !Array.isArray(item.children))) {
        throw new Error("ETSY_TAXONOMY_INVALID_NODE");
      }
      if (all.length >= MAX_NODES) throw new Error("ETSY_TAXONOMY_TREE_TOO_LARGE");
      const path = [...ancestors, item.name.trim()];
      const children = Array.isArray(item.children) ? item.children : [];
      all.push({
        taxonomy_id: item.id as number, name: item.name.trim(),
        path, leaf: children.length === 0
      });
      walk(children, path, depth + 1);
    }
  };
  walk(value.results, [], 0);
  return all;
}

function trimProperties(value: unknown) {
  if (!isObject(value) || !Array.isArray(value.results)) {
    throw new Error("ETSY_TAXONOMY_INVALID_PROPERTIES");
  }
  const properties = value.results.slice(0, MAX_PROPERTIES).map((p: unknown) => {
    if (!isObject(p) || !Number.isSafeInteger(p.property_id) ||
      (p.property_id as number) <= 0 || typeof p.name !== "string" ||
      (p.possible_values !== undefined && !Array.isArray(p.possible_values))) {
      throw new Error("ETSY_TAXONOMY_INVALID_PROPERTY");
    }
    const values = Array.isArray(p.possible_values) ? p.possible_values : [];
    return {
      property_id: p.property_id,
      name: p.name,
      display_name: typeof p.display_name === "string" ? p.display_name : null,
      is_required: typeof p.is_required === "boolean" ? p.is_required : null,
      supports_attributes: typeof p.supports_attributes === "boolean" ? p.supports_attributes : null,
      supports_variations: typeof p.supports_variations === "boolean" ? p.supports_variations : null,
      values_truncated: values.length > MAX_VALUES,
      values_total: values.length,
      possible_values: values.slice(0, MAX_VALUES).map((v: unknown) => {
        if (!isObject(v) || !Number.isSafeInteger(v.value_id) ||
          typeof v.name !== "string") throw new Error("ETSY_TAXONOMY_INVALID_VALUE");
        return {
          value_id: v.value_id,
          name: v.name,
          scale_id: Number.isSafeInteger(v.scale_id) ? v.scale_id : null
        };
      })
    };
  });
  return {
    properties,
    properties_total: value.results.length,
    properties_truncated: value.results.length > MAX_PROPERTIES
  };
}

export function rejectTaxonomyMethod() {
  return Response.json({
    mode: "READ_ONLY", status: "BLOCKED", error: "METHOD_NOT_ALLOWED",
    etsyMutationPerformed: false, ETSY_WRITE_COUNT: 0
  }, { status: 405, headers: { ...HEADERS, Allow: "GET" } });
}

export function createEtsyTaxonomyPreflightGetHandler(deps: Dependencies = {}) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "GET") return rejectTaxonomyMethod();
    const authError = authorize(request);
    if (authError) return authError;

    const url = new URL(request.url);
    const keys = [...url.searchParams.keys()];
    if (request.body !== null || keys.length !== 1 ||
      !["q", "taxonomy_id"].includes(keys[0])) {
      return blocked("ETSY_TAXONOMY_INVALID_QUERY", 400);
    }
    const search = url.searchParams.get("q");
    const taxonomyId = url.searchParams.get("taxonomy_id");
    if (search !== null &&
      (search.trim().length < 2 || search.trim().length > 50 ||
       !/^[\p{L}\p{N} '\-]+$/u.test(search.trim()))) {
      return blocked("ETSY_TAXONOMY_INVALID_SEARCH", 400);
    }
    if (taxonomyId !== null &&
      (!/^[1-9]\d{0,14}$/.test(taxonomyId) ||
       !Number.isSafeInteger(Number(taxonomyId)))) {
      return blocked("ETSY_TAXONOMY_INVALID_ID", 400);
    }

    let upstream: Response;
    try {
      upstream = await fetchEtsyReadWithRetry(
        deps.fetchImpl ?? fetch,
        taxonomyId === null ? BASE : BASE + "/" + taxonomyId + "/properties",
        { method: "GET", headers: etsyApiHeaders(), cache: "no-store" }
      );
      if (!upstream.ok) return blocked("ETSY_TAXONOMY_PROVIDER_UNAVAILABLE", 502);
      const payload: unknown = await upstream.json();
      if (search !== null) {
        const term = search.trim().toLocaleLowerCase("en");
        const matches = collectNodes(payload).filter((node) =>
          node.name.toLocaleLowerCase("en").includes(term)
        );
        return output("PASS", 200, {
          query: search.trim(), matched_total: matches.length,
          results_truncated: matches.length > MAX_SEARCH_RESULTS,
          results: matches.slice(0, MAX_SEARCH_RESULTS),
          evidence_generated_at: new Date().toISOString()
        });
      }
      return output("PASS", 200, {
        taxonomy_id: Number(taxonomyId),
        ...trimProperties(payload),
        evidence_generated_at: new Date().toISOString()
      });
    } catch {
      // Fail closed without disclosing upstream errors, keys, or other secrets.
      return blocked("ETSY_TAXONOMY_READ_FAILED", 503);
    }
  };
}
