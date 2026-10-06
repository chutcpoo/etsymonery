import { readFileSync } from "node:fs";
import { previewStubApi } from "../lib/etsy-release-preview-stub";
import { previewStubForm, PREVIEW_STUB_BRANCH, PREVIEW_STUB_HEADER, PREVIEW_STUB_MARKER } from "../lib/etsy-release-preview-fixture";
async function main() {
  const config = JSON.parse(readFileSync(process.env.PREVIEW_DB_CONFIG_FILE!, "utf8"));
  Object.assign(process.env, { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: PREVIEW_STUB_BRANCH, GENERIC_PREVIEW_DATABASE_URL: config.url, GENERIC_PREVIEW_LEDGER_SCHEMA: config.schema, ETSY_GENERIC_PREPARE_ENABLED: "false" });
  const [kind, id, fault] = process.argv.slice(2);
  const headers = { [PREVIEW_STUB_HEADER]: PREVIEW_STUB_MARKER, ...(fault ? { "x-preview-stub-fault": "draft-response-lost" } : {}) };
  const request = new Request("https://synthetic.test", { method: kind === "status" ? "GET" : "POST", headers, ...(kind === "prepare" ? { body: previewStubForm(id) } : {}) });
  const api = previewStubApi(request)!;
  const r = kind === "prepare" ? await api.prepare(request) : kind === "status" ? await api.status(request,id) : await api.publish(request,id);
  console.log(JSON.stringify({ httpStatus:r.status, ...await r.json() }));
}
main().catch(() => { console.error("DURABLE_WORKER_FAILED");process.exitCode=1; });
