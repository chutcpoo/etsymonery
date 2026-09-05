import assert from "node:assert/strict";
import test from "node:test";
import { FACTORY_DOMAIN_SCHEMA_VERSION } from "../lib/factory-domain-schemas";
import {
  ARTIFACT_DRIVE_REGISTRATION_SCHEMA_VERSION,
  registerDriveArtifact,
  registerDriveArtifacts,
  type ArtifactDriveRegistrationInput
} from "../lib/artifact-drive-registration";

const SHA = "b".repeat(64);

function input(overrides: Partial<ArtifactDriveRegistrationInput> = {}): ArtifactDriveRegistrationInput {
  return {
    schemaVersion: ARTIFACT_DRIVE_REGISTRATION_SCHEMA_VERSION,
    artifactId: "ART-202-001",
    productId: "PDT-HBOP-001",
    kind: "BUYER_ZIP",
    stage: "PRODUCTION",
    status: "REGISTERED",
    driveObject: {
      fileId: "1AbC_drive-file-202",
      url: "https://drive.google.com/file/d/1AbC_drive-file-202/view?usp=drivesdk",
      mimeType: "application/zip",
      bytes: 4096,
      sha256: SHA
    },
    ...overrides
  };
}

test("registers an observed Google Drive object into the canonical IMP-101 Artifact contract", () => {
  const artifact = registerDriveArtifact(input());
  assert.equal(artifact.schemaVersion, FACTORY_DOMAIN_SCHEMA_VERSION);
  assert.equal(artifact.driveFileId, "1AbC_drive-file-202");
  assert.equal(artifact.driveUrl, "https://drive.google.com/file/d/1AbC_drive-file-202/view?usp=drivesdk");
  assert.equal(artifact.mimeType, "application/zip");
  assert.equal(artifact.bytes, 4096);
  assert.equal(artifact.sha256, SHA);
});

test("FROZEN artifact requires exact Drive identity and SHA-256", () => {
  const artifact = registerDriveArtifact(input({ status: "FROZEN" }));
  assert.equal(artifact.status, "FROZEN");
  assert.throws(() => registerDriveArtifact(input({
    status: "FROZEN",
    driveObject: { ...input().driveObject, sha256: "" }
  })), /INVALID_ARTIFACT_SHA256/);
  assert.throws(() => registerDriveArtifact(input({
    status: "FROZEN",
    driveObject: { ...input().driveObject, fileId: "" }
  })), /INVALID_DRIVE_FILE_ID/);
});

test("local filesystem paths can never become canonical artifact identity", () => {
  const withLocalPath = { ...input(), localPath: "/Users/chutcpoo/Desktop/file.zip" } as ArtifactDriveRegistrationInput;
  assert.throws(() => registerDriveArtifact(withLocalPath), /LOCAL_PATH_NOT_CANONICAL/);
  const fileUrl = input({
    driveObject: { ...input().driveObject, url: "file:///Users/chutcpoo/Desktop/file.zip" }
  });
  assert.throws(() => registerDriveArtifact(fileUrl), /INVALID_DRIVE_URL/);
});

test("non-Google Drive URLs fail closed", () => {
  const value = input({
    driveObject: { ...input().driveObject, url: "https://example.com/file/d/1AbC_drive-file-202/view" }
  });
  assert.throws(() => registerDriveArtifact(value), /NON_GOOGLE_DRIVE_URL/);
});

test("Drive URL file ID must exactly match the observed Drive file ID", () => {
  const value = input({
    driveObject: { ...input().driveObject, url: "https://drive.google.com/file/d/DIFFERENT-ID/view" }
  });
  assert.throws(() => registerDriveArtifact(value), /DRIVE_IDENTITY_MISMATCH/);
});

test("native Google Docs URLs are accepted as Drive object identities", () => {
  const value = input({
    driveObject: {
      ...input().driveObject,
      fileId: "DOCS_FILE_202",
      url: "https://docs.google.com/spreadsheets/d/DOCS_FILE_202/edit",
      mimeType: "application/vnd.google-apps.spreadsheet"
    }
  });
  assert.equal(registerDriveArtifact(value).driveFileId, "DOCS_FILE_202");
});

test("query-style Drive URLs are accepted when their id matches", () => {
  const value = input({
    driveObject: {
      ...input().driveObject,
      fileId: "QUERY_FILE_202",
      url: "https://drive.google.com/open?id=QUERY_FILE_202"
    }
  });
  assert.equal(registerDriveArtifact(value).driveFileId, "QUERY_FILE_202");
});

test("registration delegates canonical bytes/hash validation to IMP-101", () => {
  assert.throws(() => registerDriveArtifact(input({
    driveObject: { ...input().driveObject, bytes: -1 }
  })), /INVALID_ARTIFACT_BYTES/);
  assert.throws(() => registerDriveArtifact(input({
    driveObject: { ...input().driveObject, sha256: "not-a-hash" }
  })), /INVALID_ARTIFACT_SHA256/);
});

test("batch registration is deterministic regardless of input order", () => {
  const first = input();
  const second = input({
    artifactId: "ART-202-002",
    driveObject: {
      ...input().driveObject,
      fileId: "SECOND_FILE_202",
      url: "https://drive.google.com/file/d/SECOND_FILE_202/view"
    }
  });
  assert.deepEqual(registerDriveArtifacts([first, second]), registerDriveArtifacts([second, first]));
});

test("identical duplicate artifact registrations deduplicate", () => {
  const value = input();
  const registered = registerDriveArtifacts([value, structuredClone(value)]);
  assert.equal(registered.length, 1);
  assert.equal(registered[0].artifactId, "ART-202-001");
});

test("same artifact ID with different Drive identity fails closed", () => {
  const conflicting = input({
    driveObject: {
      ...input().driveObject,
      fileId: "OTHER_FILE_202",
      url: "https://drive.google.com/file/d/OTHER_FILE_202/view"
    }
  });
  assert.throws(() => registerDriveArtifacts([input(), conflicting]), /ARTIFACT_IDENTITY_CONFLICT:ART-202-001/);
});

test("registration is read-only and never mutates observed input metadata", () => {
  const value = input();
  const before = structuredClone(value);
  registerDriveArtifact(value);
  assert.deepEqual(value, before);
});
