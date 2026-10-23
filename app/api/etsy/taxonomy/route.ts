import {
  createEtsyTaxonomyPreflightGetHandler,
  rejectTaxonomyMethod
} from "../../../../lib/etsy-taxonomy-preflight";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Authenticated GET-only: never mutates Etsy, listings, tokens, or production gates.
export const GET = createEtsyTaxonomyPreflightGetHandler();
export const POST = rejectTaxonomyMethod;
export const PUT = rejectTaxonomyMethod;
export const PATCH = rejectTaxonomyMethod;
export const DELETE = rejectTaxonomyMethod;
