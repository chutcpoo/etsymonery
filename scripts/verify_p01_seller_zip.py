#!/usr/bin/env python3
"""Verify the P01 Etsy seller ZIP, or repair stale QA evidence safely.

Only the QA JSON is refreshed. A stale or inconsistent manifest is a hard error;
no buyer deliverable or listing preview bytes are changed. Requires Python 3.10+.

Usage: python scripts/verify_p01_seller_zip.py package.zip [--repair] [--output fixed.zip]
"""

import argparse
from datetime import datetime
import hashlib
import json
from pathlib import Path, PurePosixPath
import sys
import zipfile
from zoneinfo import ZoneInfo


class PackageError(ValueError):
    pass


def _read_json(archive, name):
    try:
        return json.loads(archive.read(name))
    except (KeyError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise PackageError(f"Missing or invalid JSON: {name}: {exc}") from exc


def _required_entries(archive):
    entries = [item.filename for item in archive.infolist()]
    if len(entries) != len(set(entries)):
        raise PackageError("ZIP contains duplicate filenames")
    # Inspect every ZIP member, including directory-only entries. Otherwise an
    # unsafe '../' directory could pass and be copied into a repaired archive.
    for name in entries:
        path = PurePosixPath(name)
        if path.is_absolute() or '..' in path.parts or '\\' in name or (path.parts and path.parts[0].endswith(':')):
            raise PackageError("ZIP contains an unsafe filename")
    names = [item.filename for item in archive.infolist() if not item.is_dir()]
    manifests = [x for x in names if x.startswith('P01_MANIFEST_') and x.endswith('.json')]
    qa_files = [x for x in names if x.startswith('QA_REPORTS/P01_AUTOMATED_QA_') and x.endswith('.json')]
    qa_md = [x for x in names if x.startswith('QA_REPORTS/P01_QA_REPORT_') and x.endswith('.md')]
    if len(manifests) != 1 or len(qa_files) != 1 or len(qa_md) != 1:
        raise PackageError("Expected exactly one manifest, QA JSON, and QA Markdown in QA_REPORTS")
    return names, manifests[0], qa_files[0]


def _verify(archive, *, accept_stale_qa=False):
    bad = archive.testzip()
    if bad:
        raise PackageError(f"ZIP CRC mismatch: {bad}")
    names, manifest_name, qa_name = _required_entries(archive)
    manifest, qa = _read_json(archive, manifest_name), _read_json(archive, qa_name)
    if manifest.get('product_id') != 'P01' or manifest.get('version') != qa.get('version') or qa.get('product_id') != 'P01':
        raise PackageError("Manifest/QA product or version mismatch")
    pdfs = manifest.get('final_customer_files', [])
    previews = manifest.get('listing_previews', [])
    video = manifest.get('listing_video')
    videos = [video] if isinstance(video, dict) else []
    if len(pdfs) != 2 or len(previews) != 7:
        raise PackageError("Expected 2 PDFs and 7 previews in manifest")
    actuals = {}
    allowed = {f"CUSTOMER_FILES/{r['filename']}" for r in pdfs}
    allowed.update(f"LISTING_PREVIEWS/{r['filename']}" for r in previews + videos)
    delivered = {n for n in names if n.startswith(('CUSTOMER_FILES/', 'LISTING_PREVIEWS/'))}
    if delivered != allowed:
        raise PackageError('Unexpected or missing customer/listing asset')
    for folder, records, count in [('CUSTOMER_FILES', pdfs, 2), ('LISTING_PREVIEWS', previews, 7), ('LISTING_PREVIEWS', videos, len(videos))]:
        found = [n for n in names if n in {f"{folder}/{r['filename']}" for r in records}]
        if len(found) != count:
            raise PackageError(f"Expected {count} files in {folder}; found {len(found)}")
        if len({r['filename'] for r in records}) != count:
            raise PackageError(f"Duplicate {folder} file names in manifest")
        for record in records:
            name = f"{folder}/{record['filename']}"
            if name not in names:
                raise PackageError(f"Missing deliverable: {name}")
            data = archive.read(name)
            measured = {'filename': record['filename'], 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
            actuals[name] = measured
            if any(record.get(k) != measured[k] for k in ('bytes', 'sha256')):
                raise PackageError(f"Manifest does not match delivered file: {name}")
            if folder == 'CUSTOMER_FILES' and not data.startswith(b'%PDF-'):
                raise PackageError(f"Invalid PDF signature: {name}")
            if record in previews and not (data.startswith(b'\xff\xd8') and data.endswith(b'\xff\xd9')):
                raise PackageError(f"Invalid JPEG signature: {name}")
            if record in videos and not (len(data) >= 12 and data[4:8] == b'ftyp'):
                raise PackageError(f"Invalid MP4 signature: {name}")
    checks = qa.get('checks', {})
    sections = [('customer_pdfs', pdfs, 'CUSTOMER_FILES'), ('listing_previews', previews, 'LISTING_PREVIEWS')]
    stale = []
    for section, records, folder in sections:
        block = checks.get(section, {})
        if block.get('status') != 'PASS' or len(block.get('files', [])) != len(records):
            raise PackageError(f"Malformed or failed QA section: {section}")
        qa_files = {record.get('filename'): record for record in block['files']}
        if len(qa_files) != len(records):
            raise PackageError(f"QA filename duplicates or missing data: {section}")
        for record in records:
            target = qa_files.get(record['filename'])
            if target is None:
                raise PackageError(f"QA missing {record['filename']}")
            observed = actuals[f"{folder}/{record['filename']}"]
            if any(target.get(key) != observed[key] for key in ('bytes','sha256')):
                stale.append(f"{section}/{record['filename']}")
    if stale and not accept_stale_qa:
        raise PackageError("Stale QA evidence: " + ', '.join(stale))
    # --repair permits only stale hash/size evidence, never failed quality checks.
    if qa.get('overall_status') != 'PASS':
        raise PackageError('Automated QA overall_status is not PASS')
    for check_name, check_data in checks.items():
        if not isinstance(check_data, dict) or check_data.get('status') != 'PASS':
            raise PackageError(f'Automated QA check is not PASS: {check_name}')
    return manifest, qa, qa_name, sections, actuals, stale


def verify(path):
    with zipfile.ZipFile(path) as archive:
        _, _, _, _, _, stale = _verify(archive)
    return stale


def repair(source, output):
    if source.resolve() == output.resolve():
        raise PackageError('Refusing to overwrite source archive')
    with zipfile.ZipFile(source) as src:
        _, qa, qa_name, sections, actuals, stale = _verify(src, accept_stale_qa=True)
        if not stale:
            raise PackageError('Archive already matches its QA; no repair required')
        for section, _, folder in sections:
            for record in qa['checks'][section]['files']:
                measured = actuals[f"{folder}/{record['filename']}"]
                record.update({'bytes': measured['bytes'], 'sha256': measured['sha256']})
        qa['tested_at_ict'] = datetime.now(ZoneInfo('Asia/Bangkok')).isoformat(timespec='seconds')
        qa['revalidated_against_manifest'] = True
        qa['repair_note'] = 'File-size and SHA-256 metadata recomputed from ZIP members; static layout checks are from prior QA.'
        payload = (json.dumps(qa, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
        output.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(output, 'w') as dst:
            for item in src.infolist():
                data = payload if item.filename == qa_name else src.read(item.filename)
                dst.writestr(item, data)
    verify(output)
    return stale


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('zip_path', type=Path)
    parser.add_argument('--repair', action='store_true', help='write a new ZIP with refreshed QA JSON; preserve all deliverables')
    parser.add_argument('--output', type=Path, help='required output ZIP path when using --repair')
    args = parser.parse_args()
    try:
        if args.repair:
            if args.output is None:
                raise PackageError('--repair requires --output')
            stale = repair(args.zip_path, args.output)
            print(f'PASS: updated QA for {", ".join(stale)}; wrote {args.output}')
        else:
            verify(args.zip_path)
            print(f'PASS: ZIP CRC, manifest bytes/SHA-256, QA bytes/SHA-256, PDF/JPEG assets and declared MP4: {args.zip_path}')
    except (PackageError, OSError, zipfile.BadZipFile) as exc:
        print(f'FAIL: {exc}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
