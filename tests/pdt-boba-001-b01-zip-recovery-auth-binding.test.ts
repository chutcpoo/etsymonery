import assert from "node:assert/strict";
import test from "node:test";
import { hashOperationRequest } from "../lib/operation-ledger";
import {
  exactPdtBoba001B01ZipRecovery001Body,
  resolvePdtBoba001B01ZipRecovery001AuthorizationBinding
} from "../lib/pdt-boba-001-b01-buyer-files-zip-recovery-001";

const OLD_AUTH = "PDT-BOBA-001-B01-ZIP-RECOVERY-AUTH-20260912-03";
const OLD_BAD_SHA = "2bbe9b6261c6ce1e6b9477e37c256864b1bee2a1052a6f860067d377f4fa6fe6";
const CURRENT_AUTH = "PDT-BOBA-001-B01-ZIP-RECOVERY-AUTH-20260912-04";
const CURRENT_SHA = "f266e9fab9fcc5731d61f4b1002a8a72c476f6a2a47dda6b6774a333bfd12446";

test("exact body supersedes only the known stale production authorization ID", () => {
  const body = exactPdtBoba001B01ZipRecovery001Body(OLD_AUTH);
  assert.equal(body.authorizationId, CURRENT_AUTH);
  assert.equal(body.operationId, "PDT-BOBA-001-B01-BUYER-FILES-ZIP-RECOVERY-003");
  assert.equal(hashOperationRequest(body), CURRENT_SHA);
});

test("known stale production env binding resolves to the fresh canonical authorization", () => {
  assert.deepEqual(
    resolvePdtBoba001B01ZipRecovery001AuthorizationBinding(OLD_AUTH, OLD_BAD_SHA),
    {
      authorizationId: CURRENT_AUTH,
      requestSha256: CURRENT_SHA,
      migratedFromSuperseded: true
    }
  );
});

test("unrecognized binding is not silently migrated", () => {
  const otherSha = "0".repeat(64);
  assert.deepEqual(
    resolvePdtBoba001B01ZipRecovery001AuthorizationBinding(OLD_AUTH, otherSha),
    {
      authorizationId: OLD_AUTH,
      requestSha256: otherSha,
      migratedFromSuperseded: false
    }
  );
});
