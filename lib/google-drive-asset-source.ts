import { createHash, createSign } from "node:crypto";

export const DRIVE_ASSET_SOURCE_VERSION = "1.0.0" as const;
export const DRIVE_MAX_BUYER_BYTES = 20 * 1024 * 1024;
export const DRIVE_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API = "https://www.googleapis.com/drive/v3/files";
const FILE_ID = /^[A-Za-z0-9_-]{10,200}$/;
const SHA = /^[a-f0-9]{64}$/;

export type DriveAssetKind = "UPLOAD_FILE" | "UPLOAD_IMAGE";
export type DriveAssetSpec = {
  driveFileId: string;
  assetName: string;
  expectedSha256: string;
  expectedBytes: number;
  kind: DriveAssetKind;
};
export type VerifiedDriveAsset = {
  driveFileId: string;
  assetName: string;
  sha256: string;
  sizeBytes: number;
  mimeType: string;
  bytes: Uint8Array;
};

type DriveMetadata = {
  id?: string; name?: string; size?: string; mimeType?: string;
  parents?: string[]; capabilities?: { canDownload?: boolean };
  trashed?: boolean;
};
export type DriveAssetDependencies = {
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string>;
  sourceRootId?: string;
};

function assertId(value: string) {
  if (!FILE_ID.test(value)) throw new Error("INVALID_GOOGLE_DRIVE_FILE_ID");
  return value;
}

function getSourceRootId(sourceRootId?: string) {
  const value = (sourceRootId ?? process.env.GOOGLE_DRIVE_SOURCE_ROOT_ID ?? "").trim();
  if (!FILE_ID.test(value)) throw new Error("GOOGLE_DRIVE_SOURCE_ROOT_NOT_CONFIGURED");
  return value;
}

function toBase64Url(bytes: Buffer | string) {
  return Buffer.from(bytes).toString("base64url");
}

export async function getGoogleDriveServiceAccessToken(fetchImpl: typeof fetch = fetch) {
  const encoded = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON?.trim();
  if (!encoded) throw new Error("GOOGLE_DRIVE_SERVICE_ACCOUNT_NOT_CONFIGURED");
  let credentials: { client_email?: string; private_key?: string; token_uri?: string };
  try { credentials = JSON.parse(encoded) as typeof credentials; }
  catch { throw new Error("GOOGLE_DRIVE_SERVICE_ACCOUNT_INVALID"); }
  if (!credentials.client_email || !credentials.private_key ||
      !credentials.client_email.endsWith(".gserviceaccount.com") ||
      (credentials.token_uri && credentials.token_uri !== TOKEN_URL)) {
    throw new Error("GOOGLE_DRIVE_SERVICE_ACCOUNT_INVALID");
  }
  const now = Math.floor(Date.now() / 1000);
  const header = toBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = toBase64Url(JSON.stringify({
    iss: credentials.client_email,
    scope: DRIVE_SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600
  }));
  const input = `${header}.${claims}`;
  let signature: string;
  try {
    const signer = createSign("RSA-SHA256");
    signer.update(input);
    signer.end();
    signature = signer.sign(credentials.private_key).toString("base64url");
  } catch { throw new Error("GOOGLE_DRIVE_SERVICE_ACCOUNT_SIGN_FAILED"); }
  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${input}.${signature}`
    }),
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`GOOGLE_DRIVE_TOKEN_EXCHANGE_FAILED:${response.status}`);
  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("GOOGLE_DRIVE_ACCESS_TOKEN_MISSING");
  return data.access_token;
}

async function getMetadata(fileId: string, accessToken: string, fetchImpl: typeof fetch): Promise<DriveMetadata> {
  const url = `${DRIVE_API}/${encodeURIComponent(assertId(fileId))}?fields=id,name,size,mimeType,parents,trashed,capabilities(canDownload)&supportsAllDrives=true`;
  const response = await fetchImpl(url, {
    method: "GET", headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store"
  });
  if (!response.ok) throw new Error(`GOOGLE_DRIVE_METADATA_FAILED:${response.status}`);
  const metadata = (await response.json()) as DriveMetadata;
  if (metadata.id !== fileId || metadata.trashed) throw new Error("GOOGLE_DRIVE_IDENTITY_MISMATCH");
  return metadata;
}

async function assertUnderRoot(
  file: DriveMetadata, rootId: string, accessToken: string, fetchImpl: typeof fetch
) {
  let parents = file.parents ?? [];
  const visited = new Set<string>();
  for (let depth = 0; depth < 12 && parents.length; depth += 1) {
    if (parents.includes(rootId)) return;
    if (parents.length > 20) throw new Error("GOOGLE_DRIVE_PARENT_GRAPH_TOO_LARGE");
    const next: string[] = [];
    for (const id of parents) {
      if (visited.has(id)) continue;
      visited.add(id);
      if (visited.size > 30) throw new Error("GOOGLE_DRIVE_PARENT_GRAPH_TOO_LARGE");
      const item = await getMetadata(id, accessToken, fetchImpl);
      next.push(...(item.parents ?? []));
    }
    parents = next;
  }
  throw new Error("GOOGLE_DRIVE_FILE_OUTSIDE_APPROVED_ROOT");
}

function validateSpec(spec: DriveAssetSpec) {
  assertId(spec.driveFileId);
  if (!spec.assetName || spec.assetName.length > 150 ||
      spec.assetName.includes("/") || spec.assetName.includes("\\") ||
      /[\r\n]/.test(spec.assetName)) throw new Error("INVALID_DRIVE_ASSET_NAME");
  if (!SHA.test(spec.expectedSha256)) throw new Error("INVALID_DRIVE_ASSET_SHA");
  const max = spec.kind === "UPLOAD_IMAGE" ? DRIVE_MAX_IMAGE_BYTES : DRIVE_MAX_BUYER_BYTES;
  if (!Number.isSafeInteger(spec.expectedBytes) || spec.expectedBytes < 1 ||
      spec.expectedBytes > max) throw new Error("INVALID_DRIVE_ASSET_SIZE");
  const extension = spec.assetName.toLowerCase().split(".").pop();
  if (spec.kind === "UPLOAD_IMAGE" && !["jpg", "jpeg", "png"].includes(extension ?? "")) {
    throw new Error("DRIVE_IMAGE_FORMAT_NOT_ALLOWED");
  }
  if (spec.kind === "UPLOAD_FILE" && !["pdf", "zip"].includes(extension ?? "")) {
    throw new Error("DRIVE_BUYER_FORMAT_NOT_ALLOWED");
  }
}

export async function fetchVerifiedGoogleDriveAsset(
  spec: DriveAssetSpec,
  dependencies: DriveAssetDependencies = {}
): Promise<VerifiedDriveAsset> {
  validateSpec(spec);
  const rootId = getSourceRootId(dependencies.sourceRootId);
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const accessToken = await (dependencies.getAccessToken
    ? dependencies.getAccessToken()
    : getGoogleDriveServiceAccessToken(fetchImpl));
  const metadata = await getMetadata(spec.driveFileId, accessToken, fetchImpl);
  if (metadata.capabilities?.canDownload === false) {
    throw new Error("GOOGLE_DRIVE_DOWNLOAD_NOT_PERMITTED");
  }
  if (metadata.name !== spec.assetName) throw new Error("GOOGLE_DRIVE_FILENAME_MISMATCH");
  if (metadata.mimeType?.startsWith("application/vnd.google-apps.")) {
    throw new Error("GOOGLE_DRIVE_NATIVE_FILE_NOT_SUPPORTED");
  }
  if (!metadata.size || Number(metadata.size) !== spec.expectedBytes) {
    throw new Error("GOOGLE_DRIVE_SIZE_MISMATCH");
  }
  await assertUnderRoot(metadata, rootId, accessToken, fetchImpl);
  const response = await fetchImpl(
    `${DRIVE_API}/${encodeURIComponent(spec.driveFileId)}?alt=media&supportsAllDrives=true`,
    { method: "GET", headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" }
  );
  if (!response.ok) throw new Error(`GOOGLE_DRIVE_DOWNLOAD_FAILED:${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength !== spec.expectedBytes) throw new Error("GOOGLE_DRIVE_DOWNLOAD_SIZE_MISMATCH");
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== spec.expectedSha256) throw new Error("GOOGLE_DRIVE_SOURCE_SHA256_MISMATCH");
  return {
    driveFileId: spec.driveFileId,
    assetName: spec.assetName,
    sha256: actual,
    sizeBytes: bytes.byteLength,
    mimeType: metadata.mimeType ?? "application/octet-stream",
    bytes
  };
}
