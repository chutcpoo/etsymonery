import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  PDT_FCMP_002_V1_RECOVERY_AUTHORIZATION_TEXT,
  PDT_FCMP_002_V1_RECOVERY_CANDIDATE_FINGERPRINT,
  PDT_FCMP_002_V1_RECOVERY_FILE
} from "./pdt-fcmp-002-v1-recovery-manifest";
import {
  handlePdtFcmp002V1RecoveryPost
} from "./pdt-fcmp-002-v1-recovery";
import {
  PDT_FCMP_002_V1_LISTING_FINGERPRINT
} from "./pdt-fcmp-002-v1-manifest";

const RELAY_NONCE_SHA256 =
  "06fdcb1af84b727341c90cc584e5e43a14c290f2c4f0f1b7306518ce69135171";
const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT_SHA = /^[a-f0-9]{40}$/;

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function runtimeCommit() {
  return process.env.VERCEL_GIT_COMMIT_SHA?.trim().toLowerCase() ?? "";
}

function relayEnabled() {
  return (
    process.env.VERCEL_ENV === "production" &&
    (process.env.VERCEL_GIT_COMMIT_MESSAGE ?? "").includes(
      "[GATE_FCMP_RECOVERY_EXECUTE]"
    )
  );
}

function authorizedNonce(value: string) {
  const hash = createHash("sha256").update(value, "utf8").digest("hex");
  return secureEqual(hash, RELAY_NONCE_SHA256);
}

function allowedAssetUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("RELAY_ASSET_URL_PROTOCOL");
  if (!/^sdmntpr[a-z0-9-]*\.oaiusercontent\.com$/i.test(url.hostname)) {
    throw new Error("RELAY_ASSET_URL_HOST");
  }
  return url;
}

export async function handlePdtFcmp002V1RecoveryRelayGet(request: Request) {
  try {
    if (!relayEnabled()) {
      return NextResponse.json(
        { status: "BLOCKED_FAIL_CLOSED", error: "RELAY_DISABLED", ETSY_WRITE_COUNT: 0 },
        { status: 403 }
      );
    }

    const url = new URL(request.url);
    const nonce = url.searchParams.get("nonce")?.trim() ?? "";
    if (!nonce || !authorizedNonce(nonce)) {
      return NextResponse.json(
        { status: "BLOCKED_FAIL_CLOSED", error: "RELAY_UNAUTHORIZED", ETSY_WRITE_COUNT: 0 },
        { status: 401 }
      );
    }

    const protectedStateFingerprint =
      url.searchParams.get("protectedStateFingerprint")?.trim().toLowerCase() ?? "";
    const requestHash =
      url.searchParams.get("requestHash")?.trim().toLowerCase() ?? "";
    if (!SHA256.test(protectedStateFingerprint) || !SHA256.test(requestHash)) {
      return NextResponse.json(
        { status: "BLOCKED_FAIL_CLOSED", error: "RELAY_FINGERPRINT_INVALID", ETSY_WRITE_COUNT: 0 },
        { status: 400 }
      );
    }

    const commit = runtimeCommit();
    if (!COMMIT_SHA.test(commit)) {
      return NextResponse.json(
        { status: "BLOCKED_FAIL_CLOSED", error: "RELAY_RUNTIME_COMMIT_INVALID", ETSY_WRITE_COUNT: 0 },
        { status: 409 }
      );
    }

    const assetRaw = url.searchParams.get("asset_url") ?? "";
    const assetUrl = allowedAssetUrl(assetRaw);
    const assetResponse = await fetch(assetUrl, { cache: "no-store" });
    if (!assetResponse.ok) {
      throw new Error("RELAY_ASSET_FETCH_HTTP_" + String(assetResponse.status));
    }
    const bytes = Buffer.from(await assetResponse.arrayBuffer());
    if (bytes.length !== PDT_FCMP_002_V1_RECOVERY_FILE.sizeBytes) {
      throw new Error("RELAY_ASSET_SIZE_MISMATCH");
    }
    const actualSha = createHash("sha256").update(bytes).digest("hex");
    if (!secureEqual(actualSha, PDT_FCMP_002_V1_RECOVERY_FILE.sha256)) {
      throw new Error("RELAY_ASSET_SHA256_MISMATCH");
    }

    const file = new File(
      [bytes],
      PDT_FCMP_002_V1_RECOVERY_FILE.fileName,
      { type: PDT_FCMP_002_V1_RECOVERY_FILE.mimeType }
    );
    const form = new FormData();
    form.append("authorizationText", PDT_FCMP_002_V1_RECOVERY_AUTHORIZATION_TEXT);
    form.append(
      "recoveryCandidateFingerprint",
      PDT_FCMP_002_V1_RECOVERY_CANDIDATE_FINGERPRINT
    );
    form.append("listingFingerprint", PDT_FCMP_002_V1_LISTING_FINGERPRINT);
    form.append("protectedStateFingerprint", protectedStateFingerprint);
    form.append("productionCommit", commit);
    form.append("deploymentCommit", commit);
    form.append("requestHash", requestHash);
    form.append("buyerFile01", file, PDT_FCMP_002_V1_RECOVERY_FILE.fileName);

    const internalRequest = new Request("https://internal.invalid/recovery", {
      method: "POST",
      headers: {
        "x-autodigitalpublisher-write-token":
          PDT_FCMP_002_V1_RECOVERY_AUTHORIZATION_TEXT
      },
      body: form
    });
    return handlePdtFcmp002V1RecoveryPost(internalRequest);
  } catch (error) {
    return NextResponse.json(
      {
        status: "BLOCKED_FAIL_CLOSED",
        error: error instanceof Error ? error.message : "UNKNOWN",
        ETSY_WRITE_COUNT: 0
      },
      { status: 400 }
    );
  }
}
