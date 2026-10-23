import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { deflateRawSync } from "node:zlib";
import test from "node:test";
import { inspectBuyerFileBytes } from "../lib/etsy-buyer-byte-integrity";
import { validateChatSourceBytes } from "../lib/etsy-chat-asset-intake";

const pdf = Buffer.from("%PDF-1.7\n%created by ChatGPT product maker\n%%EOF\n", "utf8");
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let v = n;
  for (let i = 0; i < 8; i++) v = (v & 1) ? (0xedb88320 ^ (v >>> 1)) : v >>> 1;
  return v >>> 0;
});
function crc32(input: Buffer) {
  let result = 0xffffffff;
  for (const x of input) result = CRC_TABLE[(result ^ x) & 255] ^ (result >>> 8);
  return (result ^ 0xffffffff) >>> 0;
}
type ZipEntry = {
  name: string; body: Buffer; method?: 0 | 8;
  flags?: number; externalAttributes?: number; badCRC?: boolean;
};
function zip(entries: ZipEntry[]) {
  const local: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name);
    const method = e.method ?? 8, flags = e.flags ?? 0;
    const encoded = method === 8 ? deflateRawSync(e.body) : e.body;
    const crc = (crc32(e.body) ^ (e.badCRC ? 0xffffffff : 0)) >>> 0;
    const header = Buffer.alloc(30), record = Buffer.alloc(46);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(flags, 6);
    header.writeUInt16LE(method, 8);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(encoded.length, 18);
    header.writeUInt32LE(e.body.length, 22);
    header.writeUInt16LE(name.length, 26);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(flags, 8);
    record.writeUInt16LE(method, 10);
    record.writeUInt32LE(crc, 16);
    record.writeUInt32LE(encoded.length, 20);
    record.writeUInt32LE(e.body.length, 24);
    record.writeUInt16LE(name.length, 28);
    record.writeUInt32LE(e.externalAttributes ?? 0, 38);
    record.writeUInt32LE(offset, 42);
    const raw = Buffer.concat([header, name, encoded]);
    local.push(raw);
    central.push(record, name);
    offset += raw.length;
  }
  const centralBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBytes, end]);
}
const pdfEntry = { name: "Pages/ABC_A4.pdf", body: pdf };

test("PDF byte check requires plausible header and EOF but never claims rendered QC", () => {
  const ok = inspectBuyerFileBytes("ABC_A4.pdf", pdf);
  assert.equal(ok.issue, null);
  assert.equal(ok.level, "PDF_HEADER_EOF_ONLY");
  assert.equal(ok.pdfRenderedAndVisuallyReviewed, false);
  assert.equal(ok.independentFinalQcVerified, false);
  assert.equal(ok.publishAuthorized, false);
  assert.equal(ok.ETSY_WRITE_COUNT, 0);
  assert.equal(inspectBuyerFileBytes("ABC.pdf", Buffer.from("%PDF-1.7\nbroken")).issue,
    "PDF_EOF_MISSING_OR_TRAILING_CONTENT");
  assert.equal(inspectBuyerFileBytes("ABC.pdf", Buffer.from("not a pdf but %%EOF")).issue,
    "PDF_HEADER_INVALID");
});

test("ZIP byte check inflates, verifies CRC and reports member count", () => {
  const file = zip([pdfEntry, {name: "source/worksheet.xlsx", body: Buffer.from("xlsx-fixture"), method: 0}]);
  const result = inspectBuyerFileBytes("Printable.zip", file);
  assert.equal(result.issue, null);
  assert.equal(result.level, "ZIP_CRC_PATH_AND_SIZE");
  assert.equal(result.zipFilesVerified, 2);
  assert.equal(result.independentFinalQcVerified, false);
  assert.equal(result.ETSY_WRITE_COUNT, 0);
});

test("reject ZIP with corrupted member CRC and truncated central directory", () => {
  const bad = zip([{...pdfEntry, badCRC: true}]);
  assert.equal(inspectBuyerFileBytes("Buyer.zip", bad).issue,
    "ZIP_MEMBER_CRC_OR_SIZE_MISMATCH");
  const cut = zip([pdfEntry]).subarray(0, -7);
  assert.equal(inspectBuyerFileBytes("Buyer.zip", cut).issue,
    "ZIP_CENTRAL_DIRECTORY_MISSING");
});

test("reject traversal, absolute paths, windows paths and duplicate member names", () => {
  for (const name of ["../bad.pdf", "/root.pdf", "C:/bad.pdf", "folder\\bad.pdf", "folder//bad.pdf"]) {
    assert.equal(inspectBuyerFileBytes("Buyer.zip", zip([{name,body:pdf}])).issue,
      "ZIP_UNSAFE_MEMBER_PATH");
  }
  const repeat = zip([{name:"File.pdf",body:pdf}, {name:"file.pdf",body:pdf}]);
  assert.equal(inspectBuyerFileBytes("Buyer.zip", repeat).issue,
    "ZIP_DUPLICATE_MEMBER_PATH");
});

test("reject encrypted and symlink ZIP entries", () => {
  assert.equal(inspectBuyerFileBytes("Buyer.zip",zip([{...pdfEntry,flags:1}])).issue,
    "ZIP_ENCRYPTED_MEMBER_NOT_SUPPORTED");
  assert.equal(inspectBuyerFileBytes("Buyer.zip",zip([{
    ...pdfEntry, externalAttributes: (0xa1ff << 16) >>> 0
  }])).issue, "ZIP_SYMLINK_NOT_ALLOWED");
});

test("ZIP decompression limit blocks large expanded member before inflating", () => {
  const bomb = zip([{name:"huge.txt",body:Buffer.alloc(20_000_001,65)}]);
  assert.equal(inspectBuyerFileBytes("Buyer.zip",bomb).issue,
    "ZIP_DECOMPRESSION_LIMIT_EXCEEDED");
});

test("existing ChatGPT source upload validation now blocks corrupt ZIP with a matching SHA", () => {
  const bad = zip([{...pdfEntry,badCRC:true}]);
  const digest = createHash("sha256").update(bad).digest("hex");
  const file = new File([new Uint8Array(bad)],"Buyer.zip",{type:"application/zip"});
  const error = validateChatSourceBytes({
    driveFileId: "1jYarRJzUDIpQHB-m25FBGuJVgc3hWkaw",
    assetName: "Buyer.zip", expectedSha256: digest,
    expectedBytes: bad.length, kind: "UPLOAD_FILE"
  },file,new Uint8Array(bad));
  assert.equal(error,"ZIP_MEMBER_CRC_OR_SIZE_MISMATCH");
});
