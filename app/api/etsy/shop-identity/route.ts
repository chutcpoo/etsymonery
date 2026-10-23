import {
  createEtsyShopIdentityPreflightGetHandler,
  rejectEtsyShopIdentityWrite
} from "../../../../lib/etsy-shop-identity-preflight";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = createEtsyShopIdentityPreflightGetHandler();
export const POST = rejectEtsyShopIdentityWrite;
export const PUT = rejectEtsyShopIdentityWrite;
export const PATCH = rejectEtsyShopIdentityWrite;
export const DELETE = rejectEtsyShopIdentityWrite;
