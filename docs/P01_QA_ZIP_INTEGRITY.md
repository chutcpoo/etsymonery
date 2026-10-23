# P01 seller ZIP integrity gate (read-only Etsy)

Product P01 v1.2.1 is stored canonically on Google Drive, not in this public GitHub repository. GitHub/Vercel should contain only the verifier code and test fixtures; buyer PDFs, listing JPGs and full ZIPs must not be committed or deployed.

The 2026-10-21 audit found that the final 01_Hero.jpg matched P01_MANIFEST_v1.2.1.json but the older QA_REPORTS/P01_AUTOMATED_QA_v1.2.1.json retained a stale image hash and byte count.

## Validate a downloaded seller ZIP

```bash
python3 scripts/verify_p01_seller_zip.py P01_SELLER_REVIEW_PACKAGE_v1.2.1.zip
```

A SHA-256 or byte-size disagreement among ZIP member, manifest, and automated QA blocks approval. A corrupt ZIP, duplicate member name, unsafe path, or wrong document counts also blocks approval.

## Repair only a stale QA JSON

```bash
python3 scripts/verify_p01_seller_zip.py P01_SELLER_REVIEW_PACKAGE_v1.2.1.zip \
  --repair --output P01_SELLER_REVIEW_PACKAGE_v1.2.1_QA_FIXED.zip
python3 scripts/verify_p01_seller_zip.py P01_SELLER_REVIEW_PACKAGE_v1.2.1_QA_FIXED.zip
```

The repair command preserves the original archive and preserves all PDF/JPG/listing/manifest bytes. It updates only the embedded QA JSON size/hash evidence and marks the static layout checks as prior QA; it does **not** rerun layout, OCR, or visual tests. If the manifest itself is wrong, the repair fails closed and requires independent inspection. Keep the original Drive file until the corrected ZIP has been verified, and explicitly record the replacement's Drive file ID and SHA-256.

## Release boundary

This repository's verifier and Vercel preview do not authorize Etsy Draft, media upload or live listing writes. Keep all marketplace write flags disabled and continue requiring seller approval, exact candidate identity, independent QC and separate Production release authorization.

## 2026-10-22 P01 R2 listing video and QA Markdown gates

The original Drive seller ZIP contains **seven JPEG previews plus one MP4** under `LISTING_PREVIEWS/`. Previously the folder count logic demanded only seven total entries, rejecting a valid, declared video. The verifier now treats the optional manifest `listing_video` as one exact additional entry and checks its recorded size, SHA-256, and MP4 ftyp marker. These checks do not prove video playback quality.

When QA Markdown has been revised separately in Google Drive, compare downloaded canonical bytes explicitly:

```bash
python3 scripts/verify_p01_seller_zip.py P01_SELLER_REVIEW_PACKAGE_v1.2.1_QA_SYNC_2026-10-22.zip \
  --expected-qa-report P01_QA_REPORT_v1.2.1.md
```

This prevents reporting a stale embedded Markdown file as current. Keep the original ZIP archived and use a distinct seller-review filename for the corrected copy. Check print legibility physically and separately authorize any Etsy Draft or Publish actions; this verifier is read-only and does not confer release permission.
