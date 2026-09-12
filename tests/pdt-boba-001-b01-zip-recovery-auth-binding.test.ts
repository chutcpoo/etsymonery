import assert from "node:assert/strict";
import test from "node:test";
import { hashOperationRequest } from "../lib/operation-ledger";
import {
  exactPdtBoba001B01ZipRecovery001Body,
  resolvePdtBoba001B01ZipRecovery001AuthorizationBinding
} from "../lib/pdt-boba-001-b01-buyer-files-zip-recovery-001";

const OLD_AUTH = "PDT-BOBA-001-B01-ZIP-RECOVERY-AUTH-20260912-01";
const OLD_BAD_SHA = "7220aac4c417276360fcd3d7faab0a929fae3f825bbfa6ab86283c6325c5e816";
const CURRENT_AUTH = "PDT-BOBA-001-B01-ZIP-RECOVERY-AUTH-20260912-02";
const CURRENT_SHA = "9cb82685922aa94170e1b21f3b16697d79512eca304d2ff157c2b59c77836df4";

test("exact body supersedes only the known stale production authorization ID", () => {
  const body = exactPdtBoba001B01ZipRecovery001Body(OLD_AUTH);
  assert.equal(body.authorizationId, CURRENT_AUTH);
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
