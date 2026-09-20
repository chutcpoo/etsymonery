import test from "node:test";
import assert from "node:assert/strict";
import { handlePdtFcmp002V1RecoveryRelayGet } from "../lib/pdt-fcmp-002-v1-recovery-relay";

test("FCMP recovery relay stays fail-closed without execution marker", async () => {
  const oldEnv = {
    vercelEnv: process.env.VERCEL_ENV,
    commitMessage: process.env.VERCEL_GIT_COMMIT_MESSAGE
  };
  try {
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_GIT_COMMIT_MESSAGE = "ordinary commit";
    const response = await handlePdtFcmp002V1RecoveryRelayGet(
      new Request("https://example.test/?action=execute_relay")
    );
    const payload = await response.json() as Record<string, unknown>;
    assert.equal(response.status, 403);
    assert.equal(payload.error, "RELAY_DISABLED");
    assert.equal(payload.ETSY_WRITE_COUNT, 0);
  } finally {
    if (oldEnv.vercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = oldEnv.vercelEnv;
    if (oldEnv.commitMessage === undefined) delete process.env.VERCEL_GIT_COMMIT_MESSAGE;
    else process.env.VERCEL_GIT_COMMIT_MESSAGE = oldEnv.commitMessage;
  }
});

test("FCMP recovery relay rejects a wrong nonce before asset fetch", async () => {
  const oldEnv = {
    vercelEnv: process.env.VERCEL_ENV,
    commitMessage: process.env.VERCEL_GIT_COMMIT_MESSAGE
  };
  try {
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_GIT_COMMIT_MESSAGE =
      "[GATE_FCMP_RECOVERY_EXECUTE] relay test";
    const response = await handlePdtFcmp002V1RecoveryRelayGet(
      new Request(
        "https://example.test/?action=execute_relay&nonce=wrong&asset_url=https%3A%2F%2Fsdmntpraustraliaeast.oaiusercontent.com%2Ffile"
      )
    );
    const payload = await response.json() as Record<string, unknown>;
    assert.equal(response.status, 401);
    assert.equal(payload.error, "RELAY_UNAUTHORIZED");
    assert.equal(payload.ETSY_WRITE_COUNT, 0);
  } finally {
    if (oldEnv.vercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = oldEnv.vercelEnv;
    if (oldEnv.commitMessage === undefined) delete process.env.VERCEL_GIT_COMMIT_MESSAGE;
    else process.env.VERCEL_GIT_COMMIT_MESSAGE = oldEnv.commitMessage;
  }
});
