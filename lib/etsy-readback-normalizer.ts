import { createListingFingerprint } from "./candidate-fingerprint";

export const ETSY_READBACK_NORMALIZER_VERSION = "1.0.0" as const;
export type EtsyMoneyObservation = number | string | { amount: number; divisor: number; currency_code?: string };
export type EtsyReadBackObservation = {
  title: unknown; description: unknown; price: EtsyMoneyObservation; tags: unknown; quantity: unknown;
  who_made?: unknown; whoMade?: unknown; when_made?: unknown; whenMade?: unknown; taxonomy_id?: unknown; taxonomyId?: unknown;
  type?: unknown; state?: unknown;
};
function text(v:unknown,c:string){if(typeof v!=="string")throw new Error(c);return v.normalize("NFC").trim();}
function integer(v:unknown,c:string){if(typeof v!=="number"||!Number.isSafeInteger(v)||v<0)throw new Error(c);return v;}
function money(v:EtsyMoneyObservation){let n:number;if(typeof v==="number")n=v;else if(typeof v==="string")n=Number(v);else{if(!Number.isFinite(v.amount)||!Number.isFinite(v.divisor)||v.divisor<=0)throw new Error("INVALID_ETSY_READBACK_PRICE");n=v.amount/v.divisor;}if(!Number.isFinite(n)||n<0)throw new Error("INVALID_ETSY_READBACK_PRICE");return Number(n.toFixed(2));}
function tags(v:unknown){if(!Array.isArray(v)||!v.every(x=>typeof x==="string"))throw new Error("INVALID_ETSY_READBACK_TAGS");return v.map(x=>(x as string).normalize("NFC").trim());}
function taxonomy(v:unknown){if(typeof v!=="number"||!Number.isSafeInteger(v)||v<=0)throw new Error("INVALID_ETSY_READBACK_TAXONOMY_ID");return v;}
export function normalizeEtsyReadBack(o:EtsyReadBackObservation){
  const who=o.who_made??o.whoMade,when=o.when_made??o.whenMade,tax=o.taxonomy_id??o.taxonomyId;
  return {title:text(o.title,"INVALID_ETSY_READBACK_TITLE"),description:text(o.description,"INVALID_ETSY_READBACK_DESCRIPTION"),priceUsd:money(o.price),tags:tags(o.tags),quantity:integer(o.quantity,"INVALID_ETSY_READBACK_QUANTITY"),who_made:text(who,"INVALID_ETSY_READBACK_WHO_MADE"),when_made:text(when,"INVALID_ETSY_READBACK_WHEN_MADE"),taxonomy_id:taxonomy(tax),type:text(o.type??"download","INVALID_ETSY_READBACK_TYPE").toLowerCase(),state:text(o.state??"draft","INVALID_ETSY_READBACK_STATE").toLowerCase()};
}
export function verifyEtsyReadBackIdentity(expectedListingFingerprint:string, observation:EtsyReadBackObservation){const expected=expectedListingFingerprint.normalize("NFC").trim().toLowerCase();if(!/^[a-f0-9]{64}$/.test(expected))throw new Error("INVALID_EXPECTED_LISTING_FINGERPRINT");const normalized=normalizeEtsyReadBack(observation);const actual=createListingFingerprint(normalized);return Object.freeze({normalizerVersion:ETSY_READBACK_NORMALIZER_VERSION,status:actual===expected?"MATCH" as const:"IDENTITY_MISMATCH" as const,action:actual===expected?"CONTINUE" as const:"STOP" as const,expectedFingerprint:expected,actualFingerprint:actual,normalized:Object.freeze(normalized)});}
