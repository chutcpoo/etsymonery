import { IMAGE01_V2_RELEASE, executeImage01V2Release, postReleaseQcImage01V2, verifyImage01V2ProtectedState } from "../../../../../lib/poonthaidigital-image01-v2-9of9-release";
import { exactPdStock005R03Body, handlePdStock005R03, PD_STOCK_005_R03, verifyPdStock005R03ProtectedState } from "../../../../../lib/pd-stock-005-live-catalog-v3-r03";
import { exactPdStock005R03RecoveryR01Body, handlePdStock005R03RecoveryR01, PD_STOCK_005_R03_RECOVERY_R01, verifyPdStock005R03RecoveryR01PostRelease, verifyPdStock005R03RecoveryR01ProtectedState } from "../../../../../lib/pd-stock-005-r03-recovery-r01";
import { exactPdStock005R03RecoveryR02Body, handlePdStock005R03RecoveryR02, PD_STOCK_005_R03_RECOVERY_R02, verifyPdStock005R03RecoveryR02PostRelease, verifyPdStock005R03RecoveryR02ProtectedState } from "../../../../../lib/pd-stock-005-r03-recovery-r02";
import { exactPdStock005C01Body, handlePdStock005C01TitleTags, PD_STOCK_005_C01, verifyPdStock005C01ProtectedState } from "../../../../../lib/pd-stock-005-c01-title-tags";
import { NextResponse } from "next/server";
import {
  handlePdStock005B01TitleTags,
  PD_STOCK_005_B01
} from "../../../../../lib/pd-stock-005-b01-title-tags";
import {
  exactPdRest003A02Body,
  handlePdRest003A02TitleTagsImage1,
  PD_REST_003_A02
} from "../../../../../lib/pd-rest-003-a02-title-tags-image1";
import {
  exactPdRest003A01Body,
  handlePdRest003A01TitleTags,
  PD_REST_003_A01,
  verifyPdRest003A01ProtectedState
} from "../../../../../lib/pd-rest-003-a01-title-tags";
import {
  exactPdRest003B01Body,
  handlePdRest003B01TitleTags,
  PD_REST_003_B01,
  verifyPdRest003B01ProtectedState
} from "../../../../../lib/pd-rest-003-b01-title-tags";
import {
  exactPdtPogo001B01Body,
  handlePdtPogo001B01TitleTags,
  PDT_POGO_001_B01,
  verifyPdtPogo001B01ProtectedState
} from "../../../../../lib/pdt-pogo-001-b01-title-tags";
import {
  exactPdtHbop001B01Body,
  handlePdtHbop001B01TitleTags,
  PDT_HBOP_001_B01
} from "../../../../../lib/pdt-hbop-001-b01-title-tags";
import {
  exactPdtBoba001C03GalleryRepairBody,
  handlePdtBoba001C03GalleryRepair,
  PDT_BOBA_001_C03_GALLERY_REPAIR
} from "../../../../../lib/pdt-boba-001-c03-gallery-mobile-safe-repair";
import {
  exactPdtBoba001B01DescriptionBody,
  handlePdtBoba001B01Description,
  PDT_BOBA_001_B01_DESCRIPTION,
  verifyPdtBoba001B01ProtectedState
} from "../../../../../lib/pdt-boba-001-b01-description";
import {
  exactPdtBoba001B01BuyerFilesBody,
  handlePdtBoba001B01BuyerFiles,
  PDT_BOBA_001_B01_BUYER_FILES,
  verifyPdtBoba001B01BuyerFilesProtectedState
} from "../../../../../lib/pdt-boba-001-b01-buyer-files";
import {
  exactPdtBoba001B01Recovery001Body,
  handlePdtBoba001B01Recovery001,
  PDT_BOBA_001_B01_RECOVERY_001,
  verifyPdtBoba001B01Recovery001ProtectedState
} from "../../../../../lib/pdt-boba-001-b01-buyer-files-recovery-001";
import { exactPdtBoba001B01ZipRecovery001Body, handlePdtBoba001B01ZipRecovery001, PDT_BOBA_001_B01_ZIP_RECOVERY_001, verifyPdtBoba001B01ZipRecovery001ProtectedState } from "../../../../../lib/pdt-boba-001-b01-buyer-files-zip-recovery-001";
import { exactPdtBoba001B01ZipUploadRecovery002Body, handlePdtBoba001B01ZipUploadRecovery002, PDT_BOBA_001_B01_ZIP_UPLOAD_RECOVERY_002, verifyPdtBoba001B01ZipUploadRecovery002ProtectedState } from "../../../../../lib/pdt-boba-001-b01-buyer-files-zip-upload-recovery-002";
import { exactPdtBoba001R02VideoRepairBody, handlePdtBoba001R02VideoRepair, PDT_BOBA_001_R02_VIDEO_REPAIR, verifyPdtBoba001R02VideoProtectedState, exactPdtBoba001R02DeleteOldRecoveryBody, handlePdtBoba001R02DeleteOldRecovery, PDT_BOBA_001_R02_DELETE_OLD_RECOVERY, verifyPdtBoba001R02DeleteOldRecoveryProtectedState } from "../../../../../lib/pdt-boba-001-r02-video-repair";
import {
  exactPdtPcso001C03Body,
  handlePdtPcso001C03TitleTagsDescription,
  PDT_PCSO_001_C03
} from "../../../../../lib/pdt-pcso-001-c03-title-tags-description";
import {
  exactPdtBpsc001C09Body,
  PDT_BPSC_001_C09,
  verifyPdtBpsc001C09ProtectedState
} from "../../../../../lib/pdt-bpsc-001-c09-new-listing";
import { handlePdtBpsc001C09NewListingSafe } from "../../../../../lib/pdt-bpsc-001-c09-new-listing-safe";
import {
  exactPdtIpt001R03DraftBody,
  handlePdtIpt001R03Draft,
  PDT_IPT_001_R03_DRAFT,
  verifyPdtIpt001R03DraftProtectedState
} from "../../../../../lib/pdt-ipt-001-r03-draft";
import {
  exactPdtIpt001R04DraftBody,
  handlePdtIpt001R04Draft,
  PDT_IPT_001_R04_DRAFT,
  verifyPdtIpt001R04DraftProtectedState
} from "../../../../../lib/pdt-ipt-001-r04-draft";
import {
  exactPdtIpt001R04RecoveryR01Body,
  handlePdtIpt001R04RecoveryR01,
  PDT_IPT_001_R04_DRAFT_RECOVERY_R01,
  verifyPdtIpt001R04RecoveryR01PostRelease,
  verifyPdtIpt001R04RecoveryR01ProtectedState
} from "../../../../../lib/pdt-ipt-001-r04-draft-recovery-r01";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_OIDC_AUDIENCE = "https://autodigitalpublisher.vercel.app/api/internal/etsy/authorized-operation";
const GITHUB_REPOSITORY = "chutcpoo/etsymonery";
const GITHUB_REF = "refs/heads/main";
const GITHUB_EVENT = "workflow_dispatch";
const GITHUB_WORKFLOW_REFS = new Set([
  "chutcpoo/etsymonery/.github/workflows/execute-authorized-etsy-operation.yml@refs/heads/main",
  "chutcpoo/etsymonery/.github/workflows/execute-authorized-etsy-operation-v2.yml@refs/heads/main"
]);

type JwtHeader = { alg?: string; kid?: string; typ?: string };
type JwtClaims = { iss?: string; aud?: string | string[]; exp?: number; nbf?: number; repository?: string; ref?: string; event_name?: string; workflow_ref?: string };
type Jwk = JsonWebKey & { kid?: string; alg?: string; use?: string };

function decodeJsonSegment<T>(segment: string): T { return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as T; }
function audienceMatches(aud: JwtClaims["aud"]) { return typeof aud === "string" ? aud === GITHUB_OIDC_AUDIENCE : Array.isArray(aud) && aud.includes(GITHUB_OIDC_AUDIENCE); }
async function verifyGithubOidcToken(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("AUTHORIZED_ETSY_OIDC_MALFORMED");
  const [encodedHeader, encodedClaims, encodedSignature] = parts;
  const header = decodeJsonSegment<JwtHeader>(encodedHeader);
  const claims = decodeJsonSegment<JwtClaims>(encodedClaims);
  if (header.alg !== "RS256" || !header.kid) throw new Error("AUTHORIZED_ETSY_OIDC_HEADER_INVALID");
  if (claims.iss !== GITHUB_OIDC_ISSUER) throw new Error("AUTHORIZED_ETSY_OIDC_ISSUER_INVALID");
  if (!audienceMatches(claims.aud)) throw new Error("AUTHORIZED_ETSY_OIDC_AUDIENCE_INVALID");
  const now = Math.floor(Date.now() / 1000);
  if (!claims.exp || claims.exp < now - 30) throw new Error("AUTHORIZED_ETSY_OIDC_EXPIRED");
  if (claims.nbf && claims.nbf > now + 30) throw new Error("AUTHORIZED_ETSY_OIDC_NOT_YET_VALID");
  if (claims.repository !== GITHUB_REPOSITORY) throw new Error("AUTHORIZED_ETSY_OIDC_REPOSITORY_INVALID");
  if (claims.ref !== GITHUB_REF) throw new Error("AUTHORIZED_ETSY_OIDC_REF_INVALID");
  if (claims.event_name !== GITHUB_EVENT) throw new Error("AUTHORIZED_ETSY_OIDC_EVENT_INVALID");
  if (!claims.workflow_ref || !GITHUB_WORKFLOW_REFS.has(claims.workflow_ref)) throw new Error("AUTHORIZED_ETSY_OIDC_WORKFLOW_INVALID");
  const discoveryResponse = await fetch(`${GITHUB_OIDC_ISSUER}/.well-known/openid-configuration`, { cache: "no-store" });
  if (!discoveryResponse.ok) throw new Error("AUTHORIZED_ETSY_OIDC_DISCOVERY_FAILED");
  const discovery = await discoveryResponse.json() as { jwks_uri?: string };
  if (!discovery.jwks_uri) throw new Error("AUTHORIZED_ETSY_OIDC_JWKS_URI_MISSING");
  const jwksResponse = await fetch(discovery.jwks_uri, { cache: "no-store" });
  if (!jwksResponse.ok) throw new Error("AUTHORIZED_ETSY_OIDC_JWKS_FAILED");
  const jwks = await jwksResponse.json() as { keys?: Jwk[] };
  const key = jwks.keys?.find((candidate) => candidate.kid === header.kid && candidate.kty === "RSA");
  if (!key) throw new Error("AUTHORIZED_ETSY_OIDC_KEY_NOT_FOUND");
  const publicKey = await crypto.subtle.importKey("jwk", key, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const signed = new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`);
  const signature = Buffer.from(encodedSignature, "base64url");
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, signature, signed);
  if (!valid) throw new Error("AUTHORIZED_ETSY_OIDC_SIGNATURE_INVALID");
}

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  if (!authorization.startsWith("Bearer ")) return NextResponse.json({ error: "AUTHORIZED_ETSY_OIDC_MISSING" }, { status: 401 });
  try { await verifyGithubOidcToken(authorization.slice("Bearer ".length).trim()); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "AUTHORIZED_ETSY_OIDC_INVALID" }, { status: 401 }); }
  let payload: unknown;
  try { payload = await request.json(); }
  catch { return NextResponse.json({ error: "AUTHORIZED_ETSY_INVALID_JSON" }, { status: 400 }); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return NextResponse.json({ error: "AUTHORIZED_ETSY_INVALID_PAYLOAD" }, { status: 400 });
  const input = payload as Record<string, unknown>;
  const operationId = typeof input.operationId === "string" ? input.operationId : "";
  const confirmation = typeof input.confirmation === "string" ? input.confirmation : "";
  if (!operationId || operationId !== confirmation) return NextResponse.json({ error: "AUTHORIZED_ETSY_CONFIRMATION_MISMATCH" }, { status: 409 });

  if (
    operationId !== PD_STOCK_005_R03.operationId &&
    operationId !== PD_STOCK_005_R03_RECOVERY_R01.operationId &&
    operationId !== PD_STOCK_005_R03_RECOVERY_R02.operationId &&
    operationId !== PD_STOCK_005_C01.operationId &&
    operationId !== PD_STOCK_005_B01.operationId &&
    operationId !== PD_REST_003_A02.operationId &&
    operationId !== PD_REST_003_A01.operationId &&
    operationId !== PD_REST_003_B01.operationId &&
    operationId !== PDT_POGO_001_B01.operationId &&
    operationId !== PDT_HBOP_001_B01.operationId &&
    operationId !== PDT_BOBA_001_C03_GALLERY_REPAIR.operationId &&
    operationId !== PDT_BOBA_001_B01_DESCRIPTION.operationId &&
    operationId !== PDT_BOBA_001_B01_BUYER_FILES.operationId &&
    operationId !== PDT_BOBA_001_B01_RECOVERY_001.operationId &&
    operationId !== PDT_BOBA_001_B01_ZIP_RECOVERY_001.operationId &&
    operationId !== PDT_BOBA_001_B01_ZIP_UPLOAD_RECOVERY_002.operationId &&
    operationId !== PDT_BOBA_001_R02_VIDEO_REPAIR.operationId &&
    operationId !== PDT_BOBA_001_R02_DELETE_OLD_RECOVERY.operationId &&
    operationId !== PDT_PCSO_001_C03.operationId &&
    operationId !== IMAGE01_V2_RELEASE.operationId &&
    operationId !== PDT_BPSC_001_C09.operationId &&
    operationId !== PDT_IPT_001_R03_DRAFT.operationId &&
    operationId !== PDT_IPT_001_R04_DRAFT.operationId &&
    operationId !== PDT_IPT_001_R04_DRAFT_RECOVERY_R01.operationId
  ) return NextResponse.json({ error: "AUTHORIZED_ETSY_OPERATION_NOT_REGISTERED" }, { status: 409 });

  if (operationId === IMAGE01_V2_RELEASE.operationId && input.action === "verify_protected_state") return verifyImage01V2ProtectedState();
  if (operationId === IMAGE01_V2_RELEASE.operationId && input.action === "post_release_qc") return postReleaseQcImage01V2();
  if (operationId === PD_STOCK_005_R03.operationId && input.action === "verify_protected_state") return verifyPdStock005R03ProtectedState();
  if (operationId === PD_STOCK_005_R03_RECOVERY_R01.operationId && input.action === "verify_protected_state") return verifyPdStock005R03RecoveryR01ProtectedState();
  if (operationId === PD_STOCK_005_R03_RECOVERY_R01.operationId && input.action === "post_release_qc") return verifyPdStock005R03RecoveryR01PostRelease();
  if (operationId === PD_STOCK_005_R03_RECOVERY_R02.operationId && input.action === "verify_protected_state") return verifyPdStock005R03RecoveryR02ProtectedState();
  if (operationId === PD_STOCK_005_R03_RECOVERY_R02.operationId && input.action === "post_release_qc") return verifyPdStock005R03RecoveryR02PostRelease();
  if (operationId === PDT_BPSC_001_C09.operationId && input.action === "verify_protected_state") return verifyPdtBpsc001C09ProtectedState();
  if (operationId === PDT_IPT_001_R03_DRAFT.operationId && input.action === "verify_protected_state") return verifyPdtIpt001R03DraftProtectedState();
  if (operationId === PDT_IPT_001_R04_DRAFT.operationId && input.action === "verify_protected_state") return verifyPdtIpt001R04DraftProtectedState();
  if (operationId === PDT_IPT_001_R04_DRAFT_RECOVERY_R01.operationId && input.action === "verify_protected_state") return verifyPdtIpt001R04RecoveryR01ProtectedState();
  if (operationId === PDT_IPT_001_R04_DRAFT_RECOVERY_R01.operationId && input.action === "post_release_qc") return verifyPdtIpt001R04RecoveryR01PostRelease();
  if (operationId === PD_STOCK_005_C01.operationId && input.action === "verify_protected_state") return verifyPdStock005C01ProtectedState();
  if (operationId === PDT_BOBA_001_B01_DESCRIPTION.operationId && input.action === "verify_protected_state") return verifyPdtBoba001B01ProtectedState();
  if (operationId === PDT_BOBA_001_B01_BUYER_FILES.operationId && input.action === "verify_protected_state") return verifyPdtBoba001B01BuyerFilesProtectedState();
  if (operationId === PDT_BOBA_001_B01_RECOVERY_001.operationId && input.action === "verify_protected_state") return verifyPdtBoba001B01Recovery001ProtectedState();
  if (operationId === PDT_BOBA_001_B01_ZIP_RECOVERY_001.operationId && input.action === "verify_protected_state") return verifyPdtBoba001B01ZipRecovery001ProtectedState();
  if (operationId === PDT_BOBA_001_B01_ZIP_UPLOAD_RECOVERY_002.operationId && input.action === "verify_protected_state") return verifyPdtBoba001B01ZipUploadRecovery002ProtectedState();
  if (operationId === PDT_BOBA_001_R02_VIDEO_REPAIR.operationId && input.action === "verify_protected_state") return verifyPdtBoba001R02VideoProtectedState();
  if (operationId === PDT_BOBA_001_R02_DELETE_OLD_RECOVERY.operationId && input.action === "verify_protected_state") return verifyPdtBoba001R02DeleteOldRecoveryProtectedState();
  if (operationId === PD_REST_003_A01.operationId && input.action === "verify_protected_state") return verifyPdRest003A01ProtectedState();
  if (operationId === PD_REST_003_B01.operationId && input.action === "verify_protected_state") return verifyPdRest003B01ProtectedState();
  if (operationId === PDT_POGO_001_B01.operationId && input.action === "verify_protected_state") return verifyPdtPogo001B01ProtectedState();

  const writeToken = process.env.ETSY_B01_WRITE_TOKEN?.trim() ?? "";
  if (!writeToken) return NextResponse.json({ error: "AUTHORIZED_ETSY_WRITE_TOKEN_NOT_CONFIGURED" }, { status: 503 });

  if (operationId === IMAGE01_V2_RELEASE.operationId) {
    const authorizationId = typeof input.authorizationId === "string" ? input.authorizationId.trim() : "";
    const protectedStateFingerprint = typeof input.protectedStateFingerprint === "string" ? input.protectedStateFingerprint.trim().toLowerCase() : "";
    const authorizationRequestHash = typeof input.authorizationRequestHash === "string" ? input.authorizationRequestHash.trim().toLowerCase() : "";
    if (!authorizationId || !protectedStateFingerprint || !authorizationRequestHash) {
      return NextResponse.json({ error: "IMAGE01_V2_EXACT_AUTHORIZATION_BINDING_REQUIRED" }, { status: 409 });
    }
    return executeImage01V2Release({ authorizationId, protectedStateFingerprint, authorizationRequestHash });
  }
  if (operationId === PDT_IPT_001_R04_DRAFT_RECOVERY_R01.operationId) {
    const authorizationId = typeof input.authorizationId === "string" ? input.authorizationId.trim() : "";
    const protectedStateFingerprint = typeof input.protectedStateFingerprint === "string" ? input.protectedStateFingerprint.trim().toLowerCase() : "";
    const authorizationRequestHash = typeof input.authorizationRequestHash === "string" ? input.authorizationRequestHash.trim().toLowerCase() : "";
    const productionCommit = typeof input.productionCommit === "string" ? input.productionCommit.trim().toLowerCase() : "";
    if (!authorizationId || !protectedStateFingerprint || !authorizationRequestHash || !productionCommit) {
      return NextResponse.json({ error: "PDT_IPT_001_R04_RECOVERY_R01_EXACT_AUTHORIZATION_BINDING_REQUIRED" }, { status: 409 });
    }
    const delegated = new Request(request.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-autodigitalpublisher-write-token": writeToken
      }
    });
    return handlePdtIpt001R04RecoveryR01(
      exactPdtIpt001R04RecoveryR01Body(authorizationId, protectedStateFingerprint, productionCommit),
      authorizationRequestHash,
      delegated
    );
  }
  if (operationId === PDT_IPT_001_R04_DRAFT.operationId) {
    const authorizationId = typeof input.authorizationId === "string" ? input.authorizationId.trim() : "";
    const protectedStateFingerprint = typeof input.protectedStateFingerprint === "string" ? input.protectedStateFingerprint.trim().toLowerCase() : "";
    const authorizationRequestHash = typeof input.authorizationRequestHash === "string" ? input.authorizationRequestHash.trim().toLowerCase() : "";
    const productionCommit = typeof input.productionCommit === "string" ? input.productionCommit.trim().toLowerCase() : "";
    if (!authorizationId || !protectedStateFingerprint || !authorizationRequestHash || !productionCommit) {
      return NextResponse.json({ error: "PDT_IPT_001_R04_EXACT_AUTHORIZATION_BINDING_REQUIRED" }, { status: 409 });
    }
    const delegated = new Request(request.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-autodigitalpublisher-write-token": writeToken
      }
    });
    return handlePdtIpt001R04Draft(
      exactPdtIpt001R04DraftBody(authorizationId, protectedStateFingerprint, productionCommit),
      authorizationRequestHash,
      delegated
    );
  }

  if (operationId === PDT_IPT_001_R03_DRAFT.operationId) {
    const authorizationId = typeof input.authorizationId === "string" ? input.authorizationId.trim() : "";
    const protectedStateFingerprint = typeof input.protectedStateFingerprint === "string" ? input.protectedStateFingerprint.trim().toLowerCase() : "";
    const authorizationRequestHash = typeof input.authorizationRequestHash === "string" ? input.authorizationRequestHash.trim().toLowerCase() : "";
    const productionCommit = typeof input.productionCommit === "string" ? input.productionCommit.trim().toLowerCase() : "";
    if (!authorizationId || !protectedStateFingerprint || !authorizationRequestHash || !productionCommit) {
      return NextResponse.json({ error: "PDT_IPT_001_R03_EXACT_AUTHORIZATION_BINDING_REQUIRED" }, { status: 409 });
    }
    const delegated = new Request(request.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-autodigitalpublisher-write-token": writeToken
      }
    });
    return handlePdtIpt001R03Draft(
      exactPdtIpt001R03DraftBody(authorizationId, protectedStateFingerprint, productionCommit),
      authorizationRequestHash,
      delegated
    );
  }
  if (operationId === PDT_BPSC_001_C09.operationId) {
    const authorizationId = typeof input.authorizationId === "string" ? input.authorizationId.trim() : "";
    const protectedStateFingerprint = typeof input.protectedStateFingerprint === "string" ? input.protectedStateFingerprint.trim().toLowerCase() : "";
    const authorizationRequestHash = typeof input.authorizationRequestHash === "string" ? input.authorizationRequestHash.trim().toLowerCase() : "";
    if (!authorizationId || !protectedStateFingerprint || !authorizationRequestHash) {
      return NextResponse.json({ error: "PDT_BPSC_001_C09_EXACT_AUTHORIZATION_BINDING_REQUIRED" }, { status: 409 });
    }
    const delegated = new Request(request.url, { method: "POST", headers: { "content-type": "application/json", "x-autodigitalpublisher-write-token": writeToken } });
    return handlePdtBpsc001C09NewListingSafe(
      exactPdtBpsc001C09Body(authorizationId, protectedStateFingerprint),
      authorizationRequestHash,
      delegated
    );
  }
  if (operationId === PDT_POGO_001_B01.operationId) {
    const authorizationId = process.env.ETSY_PDT_POGO_001_B01_AUTHORIZATION_ID?.trim() ?? "";
    if (!authorizationId) return NextResponse.json({ error: "PDT_POGO_001_B01_PRODUCTION_AUTH_NOT_CONFIGURED" }, { status: 503 });
    const delegated = new Request(request.url, { method: "POST", headers: { "content-type": "application/json", "x-autodigitalpublisher-write-token": writeToken } });
    return handlePdtPogo001B01TitleTags(exactPdtPogo001B01Body(authorizationId), delegated);
  }
  if (operationId === PDT_HBOP_001_B01.operationId) {
    const delegated = new Request(request.url, { method: "POST", headers: { "content-type": "application/json", "x-autodigitalpublisher-write-token": writeToken } });
    return handlePdtHbop001B01TitleTags(exactPdtHbop001B01Body(), delegated);
  }
  if (operationId === PD_STOCK_005_C01.operationId) {
    const authorizationId = process.env.ETSY_PD_STOCK_005_C01_AUTHORIZATION_ID?.trim() ?? "";
    if (!authorizationId) return NextResponse.json({ error: "PD_STOCK_005_C01_PRODUCTION_AUTH_NOT_CONFIGURED" }, { status: 503 });
    const delegated = new Request(request.url, { method: "POST", headers: { "content-type": "application/json", "x-autodigitalpublisher-write-token": writeToken } });
    return handlePdStock005C01TitleTags(exactPdStock005C01Body(authorizationId), delegated);
  }
  if (operationId === PD_REST_003_B01.operationId) {
    const authorizationId = process.env.ETSY_PD_REST_003_B01_AUTHORIZATION_ID?.trim() ?? "";
    if (!authorizationId) return NextResponse.json({ error: "PD_REST_003_B01_PRODUCTION_AUTH_NOT_CONFIGURED" }, { status: 503 });
    const delegated = new Request(request.url, { method: "POST", headers: { "content-type": "application/json", "x-autodigitalpublisher-write-token": writeToken } });
    return handlePdRest003B01TitleTags(exactPdRest003B01Body(authorizationId), delegated);
  }
  if (operationId === PD_REST_003_A01.operationId) {
    const authorizationId = process.env.ETSY_PD_REST_003_A01_AUTHORIZATION_ID?.trim() ?? "";
    if (!authorizationId) return NextResponse.json({ error: "PD_REST_003_A01_PRODUCTION_AUTH_NOT_CONFIGURED" }, { status: 503 });
    const delegated = new Request(request.url, { method: "POST", headers: { "content-type": "application/json", "x-autodigitalpublisher-write-token": writeToken } });
    return handlePdRest003A01TitleTags(exactPdRest003A01Body(authorizationId), delegated);
  }
  if (operationId === PD_REST_003_A02.operationId) {
    const delegated = new Request(request.url, { method: "POST", headers: { "content-type": "application/json", "x-autodigitalpublisher-write-token": writeToken } });
    return handlePdRest003A02TitleTagsImage1(exactPdRest003A02Body(), delegated);
  }
  if (operationId === PDT_BOBA_001_C03_GALLERY_REPAIR.operationId) {
    const delegated = new Request(request.url, { method: "POST", headers: { "content-type": "application/json", "x-autodigitalpublisher-write-token": writeToken } });
    return handlePdtBoba001C03GalleryRepair(exactPdtBoba001C03GalleryRepairBody(), delegated);
  }
  if (operationId === PDT_BOBA_001_B01_DESCRIPTION.operationId) {
    const authorizationId = process.env.ETSY_BOBA_B01_DESCRIPTION_AUTHORIZATION_ID?.trim() ?? "";
    if (!authorizationId) return NextResponse.json({ error: "PDT_BOBA_001_B01_PRODUCTION_AUTH_NOT_CONFIGURED" }, { status: 503 });
    const delegated = new Request(request.url, { method: "POST", headers: { "content-type": "application/json", "x-autodigitalpublisher-write-token": writeToken } });
    return handlePdtBoba001B01Description(exactPdtBoba001B01DescriptionBody(authorizationId), delegated);
  }
  if (operationId === PDT_BOBA_001_B01_BUYER_FILES.operationId) {
    const authorizationId = process.env.ETSY_BOBA_B01_BUYER_FILES_AUTHORIZATION_ID?.trim() ?? "";
    if (!authorizationId) return NextResponse.json({ error: "PDT_BOBA_001_B01_BUYER_FILES_PRODUCTION_AUTH_NOT_CONFIGURED" }, { status: 503 });
    const delegated = new Request(request.url, { method: "POST", headers: { "content-type": "application/json", "x-autodigitalpublisher-write-token": writeToken } });
    return handlePdtBoba001B01BuyerFiles(exactPdtBoba001B01BuyerFilesBody(authorizationId), delegated);
  }
  if (operationId === PDT_BOBA_001_B01_RECOVERY_001.operationId) {
    const authorizationId = process.env.ETSY_BOBA_B01_RECOVERY_001_AUTHORIZATION_ID?.trim() ?? "";
    if (!authorizationId) return NextResponse.json({ error: "PDT_BOBA_RECOVERY_001_PRODUCTION_AUTH_NOT_CONFIGURED" }, { status: 503 });
    const delegated = new Request(request.url, { method: "POST", headers: { "content-type": "application/json", "x-autodigitalpublisher-write-token": writeToken } });
    return handlePdtBoba001B01Recovery001(exactPdtBoba001B01Recovery001Body(authorizationId), delegated);
  }
  if (operationId === PDT_BOBA_001_B01_ZIP_RECOVERY_001.operationId) {
    const authorizationId = process.env.ETSY_BOBA_B01_ZIP_RECOVERY_001_AUTHORIZATION_ID?.trim() ?? "";
    if (!authorizationId) return NextResponse.json({ error: "PDT_BOBA_ZIP_RECOVERY_001_PRODUCTION_AUTH_NOT_CONFIGURED" }, { status: 503 });
    const delegated = new Request(request.url, { method: "POST", headers: { "content-type": "application/json", "x-autodigitalpublisher-write-token": writeToken } });
    return handlePdtBoba001B01ZipRecovery001(exactPdtBoba001B01ZipRecovery001Body(authorizationId), delegated);
  }
  if (operationId === PDT_BOBA_001_B01_ZIP_UPLOAD_RECOVERY_002.operationId) {
    const authorizationId = process.env.ETSY_BOBA_B01_ZIP_UPLOAD_RECOVERY_002_AUTHORIZATION_ID?.trim() ?? "";
    if (!authorizationId) return NextResponse.json({ error: "PDT_BOBA_ZIP_UPLOAD_RECOVERY_002_PRODUCTION_AUTH_NOT_CONFIGURED" }, { status: 503 });
    const delegated = new Request(request.url, { method: "POST", headers: { "content-type": "application/json", "x-autodigitalpublisher-write-token": writeToken } });
    return handlePdtBoba001B01ZipUploadRecovery002(exactPdtBoba001B01ZipUploadRecovery002Body(authorizationId), delegated);
  }
  if (operationId === PDT_BOBA_001_R02_VIDEO_REPAIR.operationId) {
    const authorizationId = typeof input.authorizationId === "string" ? input.authorizationId.trim() : "";
    const protectedStateFingerprint = typeof input.protectedStateFingerprint === "string" ? input.protectedStateFingerprint.trim().toLowerCase() : "";
    const authorizationRequestHash = typeof input.authorizationRequestHash === "string" ? input.authorizationRequestHash.trim().toLowerCase() : "";
    if (!authorizationId || !protectedStateFingerprint || !authorizationRequestHash) return NextResponse.json({ error: "PDT_BOBA_R02_VIDEO_EXACT_AUTHORIZATION_BINDING_REQUIRED" }, { status: 409 });
    const delegated = new Request(request.url, { method: "POST", headers: { "content-type": "application/json", "x-autodigitalpublisher-write-token": writeToken } });
    return handlePdtBoba001R02VideoRepair(exactPdtBoba001R02VideoRepairBody(authorizationId, protectedStateFingerprint), authorizationRequestHash, delegated);
  }
  if (operationId === PD_STOCK_005_R03.operationId) {
    const authorizationId = typeof input.authorizationId === "string" ? input.authorizationId.trim() : "";
    const protectedStateFingerprint = typeof input.protectedStateFingerprint === "string" ? input.protectedStateFingerprint.trim().toLowerCase() : "";
    const authorizationRequestHash = typeof input.authorizationRequestHash === "string" ? input.authorizationRequestHash.trim().toLowerCase() : "";
    if (!authorizationId || !protectedStateFingerprint || !authorizationRequestHash) return NextResponse.json({ error: "PD_STOCK_005_R03_EXACT_AUTHORIZATION_BINDING_REQUIRED" }, { status: 409 });
    const delegated = new Request(request.url, { method: "POST", headers: { "content-type": "application/json", "x-autodigitalpublisher-write-token": writeToken } });
    return handlePdStock005R03(exactPdStock005R03Body(authorizationId, protectedStateFingerprint), authorizationRequestHash, delegated);
  }
  if (operationId === PD_STOCK_005_R03_RECOVERY_R01.operationId) {
    const authorizationId = typeof input.authorizationId === "string" ? input.authorizationId.trim() : "";
    const protectedStateFingerprint = typeof input.protectedStateFingerprint === "string" ? input.protectedStateFingerprint.trim().toLowerCase() : "";
    const authorizationRequestHash = typeof input.authorizationRequestHash === "string" ? input.authorizationRequestHash.trim().toLowerCase() : "";
    if (!authorizationId || !protectedStateFingerprint || !authorizationRequestHash) return NextResponse.json({ error: "PD_STOCK_005_R03_RECOVERY_R01_EXACT_AUTHORIZATION_BINDING_REQUIRED" }, { status: 409 });
    const delegated = new Request(request.url, { method: "POST", headers: { "content-type": "application/json", "x-autodigitalpublisher-write-token": writeToken } });
    return handlePdStock005R03RecoveryR01(exactPdStock005R03RecoveryR01Body(authorizationId, protectedStateFingerprint), authorizationRequestHash, delegated);
  }
  if (operationId === PD_STOCK_005_R03_RECOVERY_R02.operationId) {
    const authorizationId = typeof input.authorizationId === "string" ? input.authorizationId.trim() : "";
    const protectedStateFingerprint = typeof input.protectedStateFingerprint === "string" ? input.protectedStateFingerprint.trim().toLowerCase() : "";
    const authorizationRequestHash = typeof input.authorizationRequestHash === "string" ? input.authorizationRequestHash.trim().toLowerCase() : "";
    if (!authorizationId || !protectedStateFingerprint || !authorizationRequestHash) return NextResponse.json({ error: "PD_STOCK_005_R03_RECOVERY_R02_EXACT_AUTHORIZATION_BINDING_REQUIRED" }, { status: 409 });
    const delegated = new Request(request.url, { method: "POST", headers: { "content-type": "application/json", "x-autodigitalpublisher-write-token": writeToken } });
    return handlePdStock005R03RecoveryR02(exactPdStock005R03RecoveryR02Body(authorizationId, protectedStateFingerprint), authorizationRequestHash, delegated);
  }
  if (operationId === PDT_BOBA_001_R02_DELETE_OLD_RECOVERY.operationId) {
    const authorizationId = typeof input.authorizationId === "string" ? input.authorizationId.trim() : "";
    const protectedStateFingerprint = typeof input.protectedStateFingerprint === "string" ? input.protectedStateFingerprint.trim().toLowerCase() : "";
    const authorizationRequestHash = typeof input.authorizationRequestHash === "string" ? input.authorizationRequestHash.trim().toLowerCase() : "";
    if (!authorizationId || !protectedStateFingerprint || !authorizationRequestHash) return NextResponse.json({ error: "PDT_BOBA_R02_DELETE_OLD_EXACT_AUTHORIZATION_BINDING_REQUIRED" }, { status: 409 });
    const delegated = new Request(request.url, { method: "POST", headers: { "content-type": "application/json", "x-autodigitalpublisher-write-token": writeToken } });
    return handlePdtBoba001R02DeleteOldRecovery(exactPdtBoba001R02DeleteOldRecoveryBody(authorizationId, protectedStateFingerprint), authorizationRequestHash, delegated);
  }
  if (operationId === PDT_PCSO_001_C03.operationId) {
    const authorizationId = process.env.ETSY_PCSO_C03_AUTHORIZATION_ID?.trim() ?? "";
    if (!authorizationId) return NextResponse.json({ error: "PDT_PCSO_001_C03_PRODUCTION_AUTH_NOT_CONFIGURED" }, { status: 503 });
    const delegated = new Request(request.url, { method: "POST", headers: { "content-type": "application/json", "x-autodigitalpublisher-write-token": writeToken } });
    return handlePdtPcso001C03TitleTagsDescription(exactPdtPcso001C03Body(authorizationId), delegated);
  }

  const exactBody = {
    operation: PD_STOCK_005_B01.operation,
    operationId: PD_STOCK_005_B01.operationId,
    authorizationId: PD_STOCK_005_B01.authorizationId,
    productId: PD_STOCK_005_B01.productId,
    productVersion: PD_STOCK_005_B01.productVersion,
    shopId: PD_STOCK_005_B01.shopId,
    listingId: PD_STOCK_005_B01.listingId,
    candidateId: PD_STOCK_005_B01.candidateId,
    candidateFingerprint: PD_STOCK_005_B01.candidateFingerprint,
    buildId: PD_STOCK_005_B01.buildId,
    buildFingerprint: PD_STOCK_005_B01.buildFingerprint,
    acceptanceCriteriaVersion: PD_STOCK_005_B01.acceptanceCriteriaVersion,
    acceptanceCriteriaSha256: PD_STOCK_005_B01.acceptanceCriteriaSha256,
    protectedFieldSnapshotSha256: PD_STOCK_005_B01.protectedFieldSnapshotSha256,
    patch: { title: PD_STOCK_005_B01.title, tags: [...PD_STOCK_005_B01.tags] }
  };
  const delegated = new Request(request.url, { method: "POST", headers: { "content-type": "application/json", "x-autodigitalpublisher-write-token": writeToken } });
  return handlePdStock005B01TitleTags(exactBody, delegated);
}