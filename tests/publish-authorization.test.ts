import assert from "node:assert/strict";
import test from "node:test";
import { assertPublishAuthorizationUsable, consumePublishAuthorization, createPublishAuthorization, revokePublishAuthorization } from "../lib/publish-authorization";

const FP = "a".repeat(64);
const issuedAt = "2026-09-05T07:00:00.000Z";
function grant(expiresAt?: string) { return createPublishAuthorization({ authorizationId: "AUTH-303", candidateId: "CAND-1", candidateFingerprint: FP, channel: "etsy", shopId: "23582741", draftListingId: "4568730165", issuedAt, ...(expiresAt ? { expiresAt } : {}) }); }
function req(overrides: Record<string,string> = {}) { return { authorizationId: "AUTH-303", candidateId: "CAND-1", candidateFingerprint: FP, channel: "etsy", shopId: "23582741", draftListingId: "4568730165", now: "2026-09-05T07:01:00.000Z", ...overrides }; }

test("creates active scoped publish authorization", () => { const g=grant(); assert.equal(g.authorization.state,"ACTIVE"); assert.equal(g.shopId,"23582741"); assert.equal(g.draftListingId,"4568730165"); });
test("exact candidate fingerprint shop and Draft are required", () => { const g=grant(); assert.throws(()=>assertPublishAuthorizationUsable(g,req({candidateId:"OTHER"})),/AUTHORIZATION_CANDIDATE_MISMATCH/); assert.throws(()=>assertPublishAuthorizationUsable(g,req({candidateFingerprint:"b".repeat(64)})),/AUTHORIZATION_CANDIDATE_MISMATCH/); assert.throws(()=>assertPublishAuthorizationUsable(g,req({shopId:"OTHER"})),/AUTHORIZATION_SHOP_MISMATCH/); assert.throws(()=>assertPublishAuthorizationUsable(g,req({draftListingId:"OTHER"})),/AUTHORIZATION_DRAFT_MISMATCH/); });
test("channel and authorization ID are exact", () => { const g=grant(); assert.throws(()=>assertPublishAuthorizationUsable(g,req({channel:"shopify"})),/AUTHORIZATION_CHANNEL_MISMATCH/); assert.throws(()=>assertPublishAuthorizationUsable(g,req({authorizationId:"OTHER"})),/AUTHORIZATION_ID_MISMATCH/); });
test("optional expiry allows use before deadline", () => { assert.equal(assertPublishAuthorizationUsable(grant("2026-09-05T08:00:00.000Z"),req()),true); });
test("expired authorization fails closed", () => { assert.throws(()=>assertPublishAuthorizationUsable(grant("2026-09-05T07:00:30.000Z"),req()),/AUTHORIZATION_EXPIRED/); });
test("invalid expiry ordering is rejected", () => { assert.throws(()=>grant("2026-09-05T06:59:00.000Z"),/AUTHORIZATION_EXPIRY_PRECEDES_ISSUE/); });
test("consume changes state once and records consumption time", () => { const c=consumePublishAuthorization(grant(),req()); assert.equal(c.authorization.state,"CONSUMED"); assert.equal(c.authorization.consumedAt,req().now); });
test("consumed token cannot replay", () => { const c=consumePublishAuthorization(grant(),req()); assert.throws(()=>consumePublishAuthorization(c,req()),/AUTHORIZATION_NOT_ACTIVE/); });
test("revoked authorization cannot be consumed", () => { const r=revokePublishAuthorization(grant(),"2026-09-05T07:00:30.000Z"); assert.equal(r.authorization.state,"REVOKED"); assert.throws(()=>consumePublishAuthorization(r,req()),/AUTHORIZATION_NOT_ACTIVE/); });
test("authorization cannot be used before issuance", () => { assert.throws(()=>assertPublishAuthorizationUsable(grant(),req({now:"2026-09-05T06:59:00.000Z"})),/AUTHORIZATION_USE_BEFORE_ISSUED/); });
test("grant operations are immutable and do not mutate prior grant", () => { const g=grant(); const before=structuredClone(g); consumePublishAuthorization(g,req()); assert.deepEqual(g,before); });
