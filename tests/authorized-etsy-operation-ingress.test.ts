import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test, { after, mock } from "node:test";
import { readFile } from "node:fs/promises";

const HBOP_OPERATION_ID = "PDT-HBOP-001-B01-TITLE-TAGS-001";
const hbopExactBody = Object.freeze({ source: "exactPdtHbop001B01Body" });
const hbopDelegations: Array<{ body: unknown; request: Request }> = [];
let hbopBodyFactoryCalls = 0;

mock.module("../lib/pdt-hbop-001-b01-title-tags", {
  namedExports: {
    PDT_HBOP_001_B01: Object.freeze({ operationId: HBOP_OPERATION_ID }),
    exactPdtHbop001B01Body: () => {
      hbopBodyFactoryCalls += 1;
      return hbopExactBody;
    },
    handlePdtHbop001B01TitleTags: async (body: unknown, request: Request) => {
      hbopDelegations.push({ body, request });
      return Response.json({ status: "HBOP_DELEGATED" });
    }
  }
});

const originalFetch = globalThis.fetch;
const originalWriteToken = process.env.ETSY_B01_WRITE_TOKEN;

after(() => {
  globalThis.fetch = originalFetch;
  if (originalWriteToken === undefined) delete process.env.ETSY_B01_WRITE_TOKEN;
  else process.env.ETSY_B01_WRITE_TOKEN = originalWriteToken;
  mock.restoreAll();
});

function encodedJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function githubOidcFixture() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  const header = encodedJson({ alg: "RS256", kid: "test-key", typ: "JWT" });
  const now = Math.floor(Date.now() / 1000);
  const claims = encodedJson({
    iss: "https://token.actions.githubusercontent.com",
    aud: "https://autodigitalpublisher.vercel.app/api/internal/etsy/authorized-operation",
    exp: now + 300,
    nbf: now - 30,
    repository: "chutcpoo/etsymonery",
    ref: "refs/heads/main",
    event_name: "workflow_dispatch",
    workflow_ref: "chutcpoo/etsymonery/.github/workflows/execute-authorized-etsy-operation.yml@refs/heads/main"
  });
  const unsigned = `${header}.${claims}`;
  return {
    token: `${unsigned}.${sign("RSA-SHA256", Buffer.from(unsigned), privateKey).toString("base64url")}`,
    jwk: { ...jwk, kid: "test-key", alg: "RS256", use: "sig" }
  };
}

function authorizedRequest(token: string, body: Record<string, unknown>) {
  return new Request("https://example.test/api/internal/etsy/authorized-operation", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

test("durable authorized Etsy ingress uses GitHub OIDC and keeps Etsy write secret server-side", async () => {
  const route = await readFile(
    new URL("../app/api/internal/etsy/authorized-operation/route.ts", import.meta.url),
    "utf8"
  );
  const workflow = await readFile(
    new URL("../.github/workflows/execute-authorized-etsy-operation.yml", import.meta.url),
    "utf8"
  );

  assert.match(route, /token\.actions\.githubusercontent\.com/);
  assert.match(route, /GITHUB_REPOSITORY = "chutcpoo\/etsymonery"/);
  assert.match(route, /GITHUB_REF = "refs\/heads\/main"/);
  assert.match(route, /GITHUB_EVENT = "workflow_dispatch"/);
  assert.match(route, /execute-authorized-etsy-operation\.yml@refs\/heads\/main/);
  assert.match(route, /crypto\.subtle\.importKey/);
  assert.match(route, /crypto\.subtle\.verify/);
  assert.match(route, /process\.env\.ETSY_B01_WRITE_TOKEN/);
  assert.match(route, /operationId !== confirmation/);
  assert.match(route, /operationId !== PD_STOCK_005_B01\.operationId/);
  assert.match(route, /operationId !== PD_REST_003_A02\.operationId/);
  assert.match(route, /operationId !== PDT_BOBA_001_C03_GALLERY_REPAIR\.operationId/);
  assert.match(route, /operationId !== PDT_PCSO_001_C03\.operationId/);
  assert.match(route, /handlePdStock005B01TitleTags\(exactBody, delegated\)/);
  assert.match(route, /handlePdRest003A02TitleTagsImage1\(exactPdRest003A02Body\(\), delegated\)/);
  assert.match(route, /handlePdtBoba001C03GalleryRepair\(exactPdtBoba001C03GalleryRepairBody\(\), delegated\)/);
  assert.match(route, /handlePdtPcso001C03TitleTagsDescription\(exactPdtPcso001C03Body\(authorizationId\), delegated\)/);
  assert.match(route, /ETSY_PCSO_C03_AUTHORIZATION_ID/);
  assert.doesNotMatch(route, /AUTODIGITALPUBLISHER_GITHUB_TRIGGER_TOKEN/);
  assert.doesNotMatch(route, /api\.etsy\.com/);
  assert.doesNotMatch(route, /method:\s*"PATCH"/);

  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /ACTIONS_ID_TOKEN_REQUEST_URL/);
  assert.match(workflow, /ACTIONS_ID_TOKEN_REQUEST_TOKEN/);
  assert.match(workflow, /authorization.*Bearer/);
  assert.match(workflow, /RECONCILIATION_REQUIRED_DO_NOT_RETRY/);
  assert.doesNotMatch(workflow, /AUTODIGITALPUBLISHER_GITHUB_TRIGGER_TOKEN/);
  assert.doesNotMatch(workflow, /ETSY_B01_WRITE_TOKEN/);
  assert.doesNotMatch(workflow, /api\.etsy\.com/);
});

test("authorized asset staging ingress supports exact A02 and Boba C03 assets with zero Etsy writes", async () => {
  const route = await readFile(new URL("../app/api/internal/etsy/authorized-operation/asset-chunk/route.ts", import.meta.url), "utf8");
  const workflow = await readFile(new URL("../.github/workflows/execute-authorized-etsy-operation.yml", import.meta.url), "utf8");

  assert.match(route, /execute-authorized-etsy-operation\.yml@refs\/heads\/main/);
  assert.match(route, /PD_REST_003_A02\.operationId/);
  assert.match(route, /PDT_BOBA_001_C03_GALLERY_REPAIR\.operationId/);
  assert.match(route, /PDT_BOBA_001_C03_GALLERY_REPAIR\.gallery\.find\(candidate=>candidate\.sha256===requestedAssetSha256\)/);
  assert.match(route, /AUTHORIZED_ETSY_ASSET_NOT_REGISTERED/);
  assert.match(route, /stageAuthorizedAssetChunk/);
  assert.match(route, /assetSha256:registeredAssetSha256/);
  assert.match(route, /ETSY_WRITE_COUNT:0/);
  assert.doesNotMatch(route, /api\.etsy\.com/);
  assert.doesNotMatch(route, /method:\s*"(PATCH|PUT|DELETE|POST)"/);

  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /asset_sha256/);
  assert.match(workflow, /ASSET_SHA256/);
  assert.match(workflow, /assetSha256: process\.env\.ASSET_SHA256 \|\| undefined/);
  assert.match(workflow, /PDT-BOBA-001-C03-GALLERY-MOBILE-SAFE-REPAIR-001/);
  assert.match(workflow, /Missing asset_sha256 for Boba C03/);
  assert.doesNotMatch(workflow, /ETSY_B01_WRITE_TOKEN/);
  assert.doesNotMatch(workflow, /api\.etsy\.com/);
});

test("Boba C03 OIDC ingress remains exact-contract and fail-closed", async () => {
  const executionRoute = await readFile(new URL("../app/api/internal/etsy/authorized-operation/route.ts", import.meta.url), "utf8");
  const stageRoute = await readFile(new URL("../app/api/internal/etsy/authorized-operation/asset-chunk/route.ts", import.meta.url), "utf8");

  assert.match(executionRoute, /exactPdtBoba001C03GalleryRepairBody/);
  assert.match(executionRoute, /PDT_BOBA_001_C03_GALLERY_REPAIR\.operationId/);
  assert.match(executionRoute, /x-autodigitalpublisher-write-token/);
  assert.match(stageRoute, /confirmation!==operationId/);
  assert.match(stageRoute, /AUTHORIZED_ETSY_CONFIRMATION_MISMATCH/);
  assert.match(stageRoute, /AUTHORIZED_ETSY_OPERATION_NOT_REGISTERED/);
  assert.match(stageRoute, /AUTHORIZED_ETSY_ASSET_NOT_REGISTERED/);
  assert.doesNotMatch(stageRoute, /ETSY_B01_WRITE_TOKEN/);
  assert.doesNotMatch(stageRoute, /x-autodigitalpublisher-write-token/);
});

test("HBOP OIDC ingress delegates only its server-built exact body and remains fail-closed", async () => {
  const { token, jwk } = githubOidcFixture();
  const oidcUrls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    oidcUrls.push(url);
    if (url.endsWith("/.well-known/openid-configuration")) {
      return Response.json({ jwks_uri: "https://oidc.test/jwks" });
    }
    if (url === "https://oidc.test/jwks") return Response.json({ keys: [jwk] });
    throw new Error(`unexpected network request: ${url}`);
  };
  process.env.ETSY_B01_WRITE_TOKEN = "server-only-write-token";

  const { POST } = await import("../app/api/internal/etsy/authorized-operation/route");
  const delegated = await POST(authorizedRequest(token, {
    operationId: HBOP_OPERATION_ID,
    confirmation: HBOP_OPERATION_ID,
    action: "execute",
    patch: { title: "caller-controlled", tags: ["caller-controlled"] },
    candidateId: "caller-controlled"
  }));

  assert.equal(delegated.status, 200);
  assert.deepEqual(await delegated.json(), { status: "HBOP_DELEGATED" });
  assert.equal(hbopBodyFactoryCalls, 1);
  assert.equal(hbopDelegations.length, 1);
  assert.equal(hbopDelegations[0].body, hbopExactBody);
  assert.equal(hbopDelegations[0].request.headers.get("x-autodigitalpublisher-write-token"), "server-only-write-token");
  assert.deepEqual(oidcUrls, [
    "https://token.actions.githubusercontent.com/.well-known/openid-configuration",
    "https://oidc.test/jwks"
  ]);

  const confirmationMismatch = await POST(authorizedRequest(token, {
    operationId: HBOP_OPERATION_ID,
    confirmation: "wrong-operation",
    action: "execute"
  }));
  assert.equal(confirmationMismatch.status, 409);
  assert.deepEqual(await confirmationMismatch.json(), { error: "AUTHORIZED_ETSY_CONFIRMATION_MISMATCH" });

  const unregistered = await POST(authorizedRequest(token, {
    operationId: "PDT-HBOP-001-B01-TITLE-TAGS-UNREGISTERED",
    confirmation: "PDT-HBOP-001-B01-TITLE-TAGS-UNREGISTERED",
    action: "execute"
  }));
  assert.equal(unregistered.status, 409);
  assert.deepEqual(await unregistered.json(), { error: "AUTHORIZED_ETSY_OPERATION_NOT_REGISTERED" });
  assert.equal(hbopBodyFactoryCalls, 1);
  assert.equal(hbopDelegations.length, 1);
  assert.equal(oidcUrls.length, 6);
});
