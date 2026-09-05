import {
  FACTORY_DOMAIN_SCHEMA_VERSION,
  validateArtifact,
  type Artifact
} from "./factory-domain-schemas";

export const ARTIFACT_DRIVE_REGISTRATION_SCHEMA_VERSION = "1.0.0" as const;

export type DriveObjectObservation = {
  fileId: string;
  url: string;
  mimeType: string;
  bytes: number;
  sha256: string;
};

export type ArtifactDriveRegistrationInput = {
  schemaVersion: typeof ARTIFACT_DRIVE_REGISTRATION_SCHEMA_VERSION;
  artifactId: string;
  productId: string;
  kind: string;
  stage: string;
  status: "REGISTERED" | "FROZEN";
  driveObject: DriveObjectObservation;
};

const DRIVE_FILE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const LOCAL_PATH_KEYS = ["localPath", "filePath", "sourcePath"] as const;

function normalizeDriveFileId(value: string) {
  const normalized = value.normalize("NFC").trim();
  if (!normalized || !DRIVE_FILE_ID_PATTERN.test(normalized)) {
    throw new Error("INVALID_DRIVE_FILE_ID");
  }
  return normalized;
}

function extractDriveFileId(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl.normalize("NFC").trim());
  } catch {
    throw new Error("INVALID_DRIVE_URL");
  }
  if (url.protocol !== "https:") throw new Error("INVALID_DRIVE_URL");
  if (url.hostname !== "drive.google.com" && url.hostname !== "docs.google.com") {
    throw new Error("NON_GOOGLE_DRIVE_URL");
  }

  const queryId = url.searchParams.get("id");
  if (queryId) return normalizeDriveFileId(queryId);

  const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const dIndex = segments.indexOf("d");
  if (dIndex >= 0 && segments[dIndex + 1]) {
    return normalizeDriveFileId(segments[dIndex + 1]);
  }
  throw new Error("DRIVE_URL_FILE_ID_REQUIRED");
}

function assertNoLocalPath(input: ArtifactDriveRegistrationInput) {
  const record = input as ArtifactDriveRegistrationInput & Record<string, unknown>;
  for (const key of LOCAL_PATH_KEYS) {
    if (typeof record[key] === "string" && record[key].trim()) {
      throw new Error("LOCAL_PATH_NOT_CANONICAL");
    }
  }
}

function canonicalArtifactIdentity(artifact: Artifact) {
  return JSON.stringify({
    schemaVersion: artifact.schemaVersion,
    artifactId: artifact.artifactId,
    productId: artifact.productId,
    kind: artifact.kind,
    driveFileId: artifact.driveFileId,
    driveUrl: artifact.driveUrl,
    mimeType: artifact.mimeType,
    bytes: artifact.bytes,
    sha256: artifact.sha256,
    stage: artifact.stage,
    status: artifact.status
  });
}

export function registerDriveArtifact(input: ArtifactDriveRegistrationInput): Artifact {
  if (input.schemaVersion !== ARTIFACT_DRIVE_REGISTRATION_SCHEMA_VERSION) {
    throw new Error("UNSUPPORTED_ARTIFACT_DRIVE_REGISTRATION_SCHEMA_VERSION");
  }
  assertNoLocalPath(input);

  const driveFileId = normalizeDriveFileId(input.driveObject.fileId);
  const observedUrlFileId = extractDriveFileId(input.driveObject.url);
  if (driveFileId !== observedUrlFileId) throw new Error("DRIVE_IDENTITY_MISMATCH");

  return validateArtifact({
    schemaVersion: FACTORY_DOMAIN_SCHEMA_VERSION,
    artifactId: input.artifactId,
    productId: input.productId,
    kind: input.kind,
    driveFileId,
    driveUrl: input.driveObject.url.normalize("NFC").trim(),
    mimeType: input.driveObject.mimeType,
    bytes: input.driveObject.bytes,
    sha256: input.driveObject.sha256,
    stage: input.stage,
    status: input.status
  });
}

export function registerDriveArtifacts(inputs: readonly ArtifactDriveRegistrationInput[]): Artifact[] {
  const byArtifactId = new Map<string, { artifact: Artifact; identity: string }>();
  for (const input of inputs) {
    const artifact = registerDriveArtifact(input);
    const identity = canonicalArtifactIdentity(artifact);
    const existing = byArtifactId.get(artifact.artifactId);
    if (existing && existing.identity !== identity) {
      throw new Error(`ARTIFACT_IDENTITY_CONFLICT:${artifact.artifactId}`);
    }
    if (!existing) byArtifactId.set(artifact.artifactId, { artifact, identity });
  }
  return [...byArtifactId.values()]
    .map(({ artifact }) => artifact)
    .sort((a, b) => a.artifactId.localeCompare(b.artifactId, "en"));
}
