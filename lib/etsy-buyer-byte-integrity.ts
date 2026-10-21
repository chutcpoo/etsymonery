/**
 * Conservative byte-level buyer-file QC for ChatGPT-produced PDF/ZIP assets.
 * No PDF rendering/content review here. Passing bytes is NOT final QC, IP
 * verification, Etsy policy approval, or permission to upload/publish.
 */
import { inflateRawSync } from "node:zlib";

export const BUYER_BYTES_QC_VERSION = "1.0.0" as const;
const ZIP_ENTRY_LIMIT = 200;
const ZIP_SINGLE_MEMBER_MAX_BYTES = 20_000_000;
const ZIP_TOTAL_UNPACKED_MAX_BYTES = 80_000_000;

export type BuyerByteIntegrityResult = {
  issue: string | null;
  level: "PDF_HEADER_EOF_ONLY" | "ZIP_CRC_PATH_AND_SIZE" | "UNSUPPORTED";
  zipFilesVerified: number | null;
  pdfRenderedAndVisuallyReviewed: false;
  independentFinalQcVerified: false;
  publishAuthorized: false;
  ETSY_WRITE_COUNT: 0;
};

function report(
  issue: string | null,
  level: BuyerByteIntegrityResult["level"],
  zipFilesVerified: number | null = null
): BuyerByteIntegrityResult {
  return {
    issue, level, zipFilesVerified,
    pdfRenderedAndVisuallyReviewed: false,
    independentFinalQcVerified: false,
    publishAuthorized: false,
    ETSY_WRITE_COUNT: 0
  };
}

function pdfIssue(bytes: Uint8Array): string | null {
  const data = Buffer.from(bytes);
  if (data.length < 15 || !/^%PDF-(?:1\.[0-7]|2\.0)(?:\r?\n|\r)/.test(
    data.subarray(0, 12).toString("latin1")
  )) return "PDF_HEADER_INVALID";
  const tail = data.subarray(Math.max(0, data.length - 1024)).toString("latin1");
  if (!/%%EOF\s*$/.test(tail)) return "PDF_EOF_MISSING_OR_TRAILING_CONTENT";
  // A PDF page count, extraction, all-page render, embedded-script check and
  // print test require a real PDF renderer and independent QC. NOT claimed here.
  return null;
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
  return c >>> 0;
});
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const b of data) crc = CRC_TABLE[(crc ^ b) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function zipIssue(bytes: Uint8Array) {
  const data = Buffer.from(bytes);
  const blocked = (issue: string) => report(issue, "ZIP_CRC_PATH_AND_SIZE");
  const canRead = (offset: number, length: number) =>
    Number.isSafeInteger(offset) && offset >= 0 && length >= 0 &&
    offset <= data.length && length <= data.length - offset;
  const u16 = (offset: number) => data.readUInt16LE(offset);
  const u32 = (offset: number) => data.readUInt32LE(offset);

  // End-of-central-directory (EOCD); requires one valid EOCD with no trailing bytes.
  let end = -1;
  for (let pos = data.length - 22; pos >= Math.max(0, data.length - 65557); pos--) {
    if (u32(pos) === 0x06054b50 && canRead(pos, 22) &&
        canRead(pos + 22, u16(pos + 20)) &&
        pos + 22 + u16(pos + 20) === data.length) {
      end = pos;
      break;
    }
  }
  if (end < 0) return blocked("ZIP_CENTRAL_DIRECTORY_MISSING");
  if (u16(end + 4) !== 0 || u16(end + 6) !== 0 ||
      u16(end + 8) !== u16(end + 10)) {
    return blocked("ZIP_MULTI_DISK_NOT_SUPPORTED");
  }
  const count = u16(end + 10);
  if (count < 1 || count > ZIP_ENTRY_LIMIT) return blocked("ZIP_MEMBER_COUNT_INVALID");
  const directorySize = u32(end + 12), directoryOffset = u32(end + 16);
  if (directorySize === 0xffffffff || directoryOffset === 0xffffffff ||
      count === 0xffff) return blocked("ZIP64_NOT_SUPPORTED");
  if (!canRead(directoryOffset, directorySize) ||
      directoryOffset + directorySize !== end) {
    return blocked("ZIP_CENTRAL_DIRECTORY_INVALID");
  }
  let cursor = directoryOffset, totalUnpacked = 0, verifiedFiles = 0;
  const names = new Set<string>();
  const ranges: Array<{start:number;end:number}> = [];

  for (let idx = 0; idx < count; idx++) {
    if (!canRead(cursor, 46) || u32(cursor) !== 0x02014b50) {
      return blocked("ZIP_CENTRAL_MEMBER_INVALID");
    }
    const flags = u16(cursor + 8), method = u16(cursor + 10);
    const expectedCrc = u32(cursor + 16), compressedSize = u32(cursor + 20);
    const uncompressedSize = u32(cursor + 24);
    const nameLength = u16(cursor + 28), extraLength = u16(cursor + 30);
    const commentLength = u16(cursor + 32);
    const disk = u16(cursor + 34), extAttr = u32(cursor + 38);
    const localOffset = u32(cursor + 42);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (next > end || !canRead(cursor, next - cursor) || nameLength < 1 ||
        compressedSize === 0xffffffff || uncompressedSize === 0xffffffff ||
        localOffset === 0xffffffff || disk !== 0) {
      return blocked("ZIP_CENTRAL_MEMBER_INVALID");
    }
    if ((flags & 0x1) || (flags & 0x40)) return blocked("ZIP_ENCRYPTED_MEMBER_NOT_SUPPORTED");
    if (method !== 0 && method !== 8) return blocked("ZIP_COMPRESSION_NOT_SUPPORTED");
    const unixMode = extAttr >>> 16;
    if ((unixMode & 0xf000) === 0xa000) return blocked("ZIP_SYMLINK_NOT_ALLOWED");

    const nameBuffer = data.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = nameBuffer.toString("utf8").normalize("NFC");
    const folders = name.endsWith("/");
    const parts = name.replace(/\/$/, "").split("/");
    if (!name || name.includes("\\") || /[\x00-\x1f\x7f:]/.test(name) ||
        name.startsWith("/") || parts.some(p => !p || p === "." || p === "..") ||
        name.includes("\ufffd")) {
      return blocked("ZIP_UNSAFE_MEMBER_PATH");
    }
    const nameKey = name.toLowerCase();
    if (names.has(nameKey)) return blocked("ZIP_DUPLICATE_MEMBER_PATH");
    names.add(nameKey);

    if (!canRead(localOffset, 30) || u32(localOffset) !== 0x04034b50) {
      return blocked("ZIP_LOCAL_HEADER_INVALID");
    }
    const localFlags = u16(localOffset + 6), localMethod = u16(localOffset + 8);
    const localNameLength = u16(localOffset + 26), localExtraLength = u16(localOffset + 28);
    const payloadStart = localOffset + 30 + localNameLength + localExtraLength;
    const payloadEnd = payloadStart + compressedSize;
    if (localFlags !== flags || localMethod !== method ||
        localNameLength !== nameLength ||
        !canRead(localOffset + 30, localNameLength) ||
        !data.subarray(localOffset + 30, localOffset + 30 + localNameLength).equals(nameBuffer) ||
        payloadEnd > directoryOffset || !canRead(payloadStart, compressedSize)) {
      return blocked("ZIP_LOCAL_MEMBER_MISMATCH");
    }
    if (uncompressedSize > ZIP_SINGLE_MEMBER_MAX_BYTES ||
        totalUnpacked + uncompressedSize > ZIP_TOTAL_UNPACKED_MAX_BYTES) {
      return blocked("ZIP_DECOMPRESSION_LIMIT_EXCEEDED");
    }

    if (!folders) {
      let inflated: Buffer;
      try {
        const compressed = data.subarray(payloadStart, payloadEnd);
        inflated = method === 0
          ? Buffer.from(compressed)
          : inflateRawSync(compressed, { maxOutputLength: ZIP_SINGLE_MEMBER_MAX_BYTES + 1 });
      } catch {
        return blocked("ZIP_DEFLATE_OR_MEMBER_CORRUPT");
      }
      if (inflated.length !== uncompressedSize ||
          crc32(inflated) !== expectedCrc) return blocked("ZIP_MEMBER_CRC_OR_SIZE_MISMATCH");
      verifiedFiles++;
      totalUnpacked += inflated.length;
    } else if (compressedSize !== 0 || uncompressedSize !== 0) {
      return blocked("ZIP_DIRECTORY_WITH_PAYLOAD");
    }
    ranges.push({start: localOffset, end: payloadEnd});
    cursor = next;
  }
  if (cursor !== end || verifiedFiles < 1) return blocked("ZIP_EMPTY_OR_UNPARSED_DIRECTORY");
  ranges.sort((a, b) => a.start - b.start);
  if (ranges.some((range, i) => i > 0 && range.start < ranges[i - 1].end)) {
    return blocked("ZIP_LOCAL_MEMBER_OVERLAP");
  }
  return report(null, "ZIP_CRC_PATH_AND_SIZE", verifiedFiles);
}

export function inspectBuyerFileBytes(
  filename: string, bytes: Uint8Array
): BuyerByteIntegrityResult {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return report(pdfIssue(bytes), "PDF_HEADER_EOF_ONLY");
  if (lower.endsWith(".zip")) return zipIssue(bytes);
  return report("BUYER_BYTES_TYPE_NOT_IMPLEMENTED", "UNSUPPORTED");
}
