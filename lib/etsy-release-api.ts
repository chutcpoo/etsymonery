import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { NextResponse } from "next/server";
import { NeonOperationLedgerRepository, type OperationLedgerRepository } from "./operation-ledger";
import { assertReleaseId, type ProductManifest } from "./etsy-release-manifest";
import { prepareRelease, getReleaseStatus, type ReleaseEngineDependencies } from "./etsy-release-engine";

export function assertGenericPrepareRuntime() {
  // Etsy has no separate sandbox host. Preview is still a real seller write and
  // needs explicit enablement; production is forbidden regardless of flags.
  if (process.env.VERCEL_ENV !== "preview" || process.env.ETSY_GENERIC_PREPARE_ENABLED !== "true") throw new Error("GENERIC_PREPARE_RUNTIME_DISABLED");
}
export function releaseApiAuthorization(request: Request) {
  const expected = process.env.ETSY_GENERIC_RELEASE_TOKEN ?? "";
  const supplied = request.headers.get("x-autodigitalpublisher-release-token") ?? "";
  if (!expected || !supplied || Buffer.byteLength(expected) !== Buffer.byteLength(supplied) || !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) throw new Error("RELEASE_API_UNAUTHORIZED");
}
export async function loadTrustedReleaseManifest(releaseId: string): Promise<ProductManifest> {
  assertReleaseId(releaseId);
  const directory = process.env.ETSY_RELEASE_MANIFEST_DIRECTORY;
  if (!directory) throw new Error("TRUSTED_MANIFEST_STORE_NOT_CONFIGURED");
  const m = JSON.parse(await readFile(resolve(directory, `${releaseId}.json`), "utf8")) as ProductManifest;
  if (m.releaseId !== releaseId) throw new Error("MANIFEST_RELEASE_ID_MISMATCH");
  return m;
}
export type ReleaseApiDependencies = {
  ledger?: OperationLedgerRepository; loadManifest?: typeof loadTrustedReleaseManifest;
  engine?: Omit<ReleaseEngineDependencies, "ledger" | "loadManifest" | "resolveAsset">;
};
function failure(error: unknown) {
  return NextResponse.json({ status: "BLOCKED_FAIL_CLOSED", error: error instanceof Error ? error.message : "RELEASE_FAILED", livePublishPerformed: false }, { status: 409, headers: { "cache-control": "no-store" } });
}
export function createReleaseApi(deps: ReleaseApiDependencies = {}) {
  const ledger = deps.ledger ?? new NeonOperationLedgerRepository(), load = deps.loadManifest ?? loadTrustedReleaseManifest;
  return {
    prepare: async (request: Request) => {
      try {
        releaseApiAuthorization(request);
        // Fail before token, manifest store, DB or any network use when disabled.
        assertGenericPrepareRuntime();
        const form = await request.formData(); const releaseId = assertReleaseId(String(form.get("releaseId") ?? ""));
        const manifest = await load(releaseId);
        const result = await prepareRelease(manifest, { ...deps.engine, ledger, loadManifest: () => load(releaseId),
          fetchImpl: deps.engine?.fetchImpl ?? fetch, assertExecutionAllowed: assertGenericPrepareRuntime,
          resolveAsset: async asset => { const file = form.get(asset.assetId); if (!(file instanceof File)) throw new Error("MISSING_RELEASE_ASSET"); return file; } });
        return NextResponse.json(result, { status: result.status === "READY_TO_PUBLISH" ? 200 : 409, headers: { "cache-control": "no-store" } });
      } catch (error) { return failure(error); }
    },
    status: async (request: Request, releaseId: string) => {
      try { releaseApiAuthorization(request); return NextResponse.json(await getReleaseStatus(await load(assertReleaseId(releaseId)), ledger), { headers: { "cache-control": "no-store" } }); }
      catch (error) { return failure(error); }
    },
    publish: async (request: Request, _releaseId: string) => {
      try { releaseApiAuthorization(request); throw new Error("GENERIC_PRODUCTION_PUBLISH_DISABLED"); } catch (error) { return failure(error); }
    }
  };
}
