import test from "node:test";
import assert from "node:assert/strict";
import {validateP01DraftEnv,createP01Draft} from "./etsy-p01-draft.mjs";

test("P01 Draft requires explicit confirmation", () => {
  assert.throws(() => validateP01DraftEnv({}), /P01_DRAFT_EXPLICIT_CONFIRMATION_REQUIRED/);
  assert.throws(() => validateP01DraftEnv({P01_DRAFT_CONFIRMATION:"PUBLISH_EXACT_LISTING"}), /P01_DRAFT_EXPLICIT_CONFIRMATION_REQUIRED/);
});
test("P01 Draft fails without a valid approved deployment SHA", () => {
  assert.throws(() => validateP01DraftEnv({P01_DRAFT_CONFIRMATION:"CREATE_P01_DRAFT_ONLY"}), /P01_DRAFT_APPROVED_DEPLOYMENT_SHA_REQUIRED/);
});
test("P01 Draft fails without price and currency approval", () => {
  assert.throws(() => validateP01DraftEnv({
    P01_DRAFT_CONFIRMATION:"CREATE_P01_DRAFT_ONLY",
    P01_DRAFT_DEPLOYMENT_SHA:"b".repeat(40)
  }), /P01_PRICE_OR_SHOP_CURRENCY_NOT_APPROVED/);
});
test("P01 Draft cannot contact a server if protected secret is absent", async () => {
  let calls=0;
  await assert.rejects(createP01Draft({
    P01_DRAFT_CONFIRMATION:"CREATE_P01_DRAFT_ONLY",
    P01_DRAFT_DEPLOYMENT_SHA:"b".repeat(40),
    P01_DRAFT_PRICE_APPROVED_USD:"3.90",
    P01_DRAFT_SHOP_CURRENCY_VERIFIED:"USD"
  }, async()=>{calls++; throw Error("unexpected network call")}), /P01_DRAFT_PROTECTED_ENVIRONMENT_SECRETS_REQUIRED/);
  assert.equal(calls,0);
});
