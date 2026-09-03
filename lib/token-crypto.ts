import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION = "v1";

function encryptionKey() {
  const raw = process.env.TOKEN_ENCRYPTION_KEY?.trim();

  if (!raw || raw.length < 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY_NOT_CONFIGURED");
  }

  return createHash("sha256").update(raw, "utf8").digest();
}

export function encryptSecret(value: string) {
  if (!value) throw new Error("EMPTY_SECRET");

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url")
  ].join(":");
}

export function decryptSecret(envelope: string) {
  const [version, ivEncoded, tagEncoded, ciphertextEncoded] = envelope.split(":");

  if (
    version !== VERSION ||
    !ivEncoded ||
    !tagEncoded ||
    !ciphertextEncoded
  ) {
    throw new Error("INVALID_SECRET_ENVELOPE");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivEncoded, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextEncoded, "base64url")),
    decipher.final()
  ]).toString("utf8");
}
