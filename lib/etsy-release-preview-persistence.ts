import { neon } from "@neondatabase/serverless";
import { NeonOperationLedgerRepository } from "./operation-ledger";
export type StubState = { listings: Record<string, unknown>[]; images: Record<string, unknown>[]; files: Record<string, unknown>[]; videos: Record<string, unknown>[] };
export interface PreviewProviderStore { load(): Promise<StubState>; insert(kind: keyof StubState, row: Record<string, unknown>): Promise<void>; }
export function durablePreviewDependencies(releaseId: string) {
  const url = process.env.GENERIC_PREVIEW_DATABASE_URL?.trim(), schema = process.env.GENERIC_PREVIEW_LEDGER_SCHEMA?.trim();
  if (!url || !schema) throw new Error("DURABLE_PREVIEW_DATABASE_NOT_CONFIGURED");
  if (!/^generic_release_preview_[a-z0-9_]+$/.test(schema)) throw new Error("INVALID_PREVIEW_LEDGER_SCHEMA");
  // Never fall back to DATABASE_URL or the production ledger/public schema.
  const q = neon(url), table = `${schema}.synthetic_provider_resources`;
  let initialization: Promise<unknown> | undefined;
  const ensure = () => initialization ??= q.query(`CREATE TABLE IF NOT EXISTS ${table} (release_id text NOT NULL, kind text NOT NULL, resource jsonb NOT NULL, PRIMARY KEY(release_id,kind))`);
  const store: PreviewProviderStore = {
    async load() {
      await ensure(); const rows = await q.query(`SELECT kind,resource FROM ${table} WHERE release_id=$1`, [releaseId]);
      const state: StubState = { listings: [], images: [], files: [], videos: [] };
      for (const row of rows) { const kind = row.kind as keyof StubState; if (!(kind in state)) throw new Error("INVALID_STUB_RESOURCE_KIND"); state[kind].push(row.resource); }
      return state;
    },
    async insert(kind, resource) { await ensure(); const rows = await q.query(`INSERT INTO ${table}(release_id,kind,resource) VALUES($1,$2,$3::jsonb) ON CONFLICT DO NOTHING RETURNING kind`, [releaseId,kind,JSON.stringify(resource)]); if (rows.length !== 1) throw new Error("PREVIEW_STUB_DUPLICATE_CREATE"); }
  };
  return { ledger: new NeonOperationLedgerRepository({ url, schema }), store, schema };
}
