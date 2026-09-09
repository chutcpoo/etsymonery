import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";

export type AuthorizedAssetChunk = {
  operationId: string;
  assetSha256: string;
  chunkIndex: number;
  chunkCount: number;
  dataBase64: string;
};

function sql() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL_NOT_CONFIGURED");
  return neon(url);
}

async function ensureTable() {
  const q = sql();
  await q`CREATE TABLE IF NOT EXISTS authorized_operation_asset_chunks (
    operation_id text NOT NULL,
    asset_sha256 text NOT NULL,
    chunk_index integer NOT NULL,
    chunk_count integer NOT NULL,
    data_base64 text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(operation_id, asset_sha256, chunk_index)
  )`;
}

export async function stageAuthorizedAssetChunk(input: AuthorizedAssetChunk) {
  if (!input.operationId.trim()) throw new Error("INVALID_OPERATION_ID");
  if (!/^[a-f0-9]{64}$/.test(input.assetSha256)) throw new Error("INVALID_ASSET_SHA256");
  if (!Number.isSafeInteger(input.chunkIndex) || input.chunkIndex < 0) throw new Error("INVALID_CHUNK_INDEX");
  if (!Number.isSafeInteger(input.chunkCount) || input.chunkCount < 1 || input.chunkCount > 8 || input.chunkIndex >= input.chunkCount) {
    throw new Error("INVALID_CHUNK_COUNT");
  }
  if (!input.dataBase64 || input.dataBase64.length > 60000) throw new Error("INVALID_CHUNK_DATA");
  const bytes = Buffer.from(input.dataBase64, "base64");
  if (bytes.length < 1 || bytes.length > 45000 || bytes.toString("base64").replace(/=+$/u, "") !== input.dataBase64.replace(/=+$/u, "")) {
    throw new Error("INVALID_CHUNK_BASE64");
  }
  await ensureTable();
  const q = sql();
  await q`INSERT INTO authorized_operation_asset_chunks(operation_id, asset_sha256, chunk_index, chunk_count, data_base64)
    VALUES(${input.operationId}, ${input.assetSha256}, ${input.chunkIndex}, ${input.chunkCount}, ${input.dataBase64})
    ON CONFLICT(operation_id, asset_sha256, chunk_index) DO UPDATE SET
      chunk_count=EXCLUDED.chunk_count, data_base64=EXCLUDED.data_base64, created_at=now()`;
}

export async function loadAuthorizedAsset(operationId: string, assetSha256: string) {
  await ensureTable();
  const q = sql();
  const rows = await q`SELECT chunk_index, chunk_count, data_base64 FROM authorized_operation_asset_chunks
    WHERE operation_id=${operationId} AND asset_sha256=${assetSha256} ORDER BY chunk_index ASC` as Array<Record<string, unknown>>;
  if (rows.length < 1) throw new Error("AUTHORIZED_ASSET_CHUNKS_MISSING");
  const chunkCount = Number(rows[0].chunk_count);
  if (!Number.isSafeInteger(chunkCount) || rows.length !== chunkCount || rows.some((row, index) => Number(row.chunk_index) !== index || Number(row.chunk_count) !== chunkCount)) {
    throw new Error("AUTHORIZED_ASSET_CHUNK_SET_MISMATCH");
  }
  const bytes = Buffer.concat(rows.map((row) => Buffer.from(String(row.data_base64), "base64")));
  const actualSha = createHash("sha256").update(bytes).digest("hex");
  if (actualSha !== assetSha256) throw new Error("AUTHORIZED_ASSET_SHA256_MISMATCH");
  return bytes;
}

export async function clearAuthorizedAsset(operationId: string, assetSha256: string) {
  await ensureTable();
  const q = sql();
  await q`DELETE FROM authorized_operation_asset_chunks WHERE operation_id=${operationId} AND asset_sha256=${assetSha256}`;
}
