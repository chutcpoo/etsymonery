import hashlib
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from verify_p01_seller_zip import PackageError, repair, verify


class VerifyP01Test(unittest.TestCase):
    def test_repair_fixes_only_qa_and_detects_fresh_staleness(self):
        with tempfile.TemporaryDirectory() as folder:
            src, out = Path(folder) / 'source.zip', Path(folder) / 'fixed.zip'
            pdfs = [(f'pdf{i}.pdf', b'%PDF-1.4\n' + bytes([i])) for i in range(2)]
            imgs = [(f'{i}.jpg', b'\xff\xd8' + bytes([i]) + b'\xff\xd9') for i in range(7)]
            def entries(items):
                return [{'filename':name, 'bytes':len(data), 'sha256':hashlib.sha256(data).hexdigest()} for name,data in items]
            manifest = {'product_id':'P01','version':'1.2.1','final_customer_files':entries(pdfs),'listing_previews':entries(imgs)}
            old_hero = dict(manifest['listing_previews'][0], sha256='0' * 64)
            qa = {'product_id':'P01','version':'1.2.1','overall_status':'PASS','checks':{'customer_pdfs':{'status':'PASS','files':entries(pdfs)},'listing_previews':{'status':'PASS','files':[old_hero]+entries(imgs)[1:]}}}
            with zipfile.ZipFile(src, 'w') as z:
                z.writestr('P01_MANIFEST_v1.2.1.json', json.dumps(manifest))
                z.writestr('QA_REPORTS/P01_AUTOMATED_QA_v1.2.1.json', json.dumps(qa))
                z.writestr('QA_REPORTS/P01_QA_REPORT_v1.2.1.md', '# QA')
                for n,b in pdfs: z.writestr('CUSTOMER_FILES/'+n, b)
                for n,b in imgs: z.writestr('LISTING_PREVIEWS/'+n, b)
            with self.assertRaisesRegex(PackageError, 'Stale QA'):
                verify(src)
            stale=repair(src, out)
            self.assertEqual(stale,['listing_previews/0.jpg'])
            verify(out)
            with zipfile.ZipFile(src) as a,zipfile.ZipFile(out) as b:
                for name in a.namelist():
                    if 'AUTOMATED_QA' not in name:
                        self.assertEqual(a.read(name), b.read(name))
            with self.assertRaisesRegex(PackageError, 'already matches'):
                repair(out, Path(folder)/'third.zip')

            # Even a directory-only ZIP member must be checked for traversal.
            unsafe = Path(folder) / 'unsafe-directory.zip'
            with zipfile.ZipFile(src) as inp, zipfile.ZipFile(unsafe, 'w') as dst:
                for item in inp.infolist():
                    dst.writestr(item, inp.read(item))
                dst.writestr('../outside/', b'')
            with self.assertRaisesRegex(PackageError, 'unsafe filename'):
                verify(unsafe)
            with self.assertRaisesRegex(PackageError, 'unsafe filename'):
                repair(unsafe, Path(folder)/'rejected-unsafe.zip')

            # A stale file hash must never turn an unrelated failed QA into PASS.
            for case, failed_qa in (
                ('overall', dict(qa, overall_status='FAIL')),
                ('listing_draft', dict(qa, checks={**qa['checks'], 'listing_draft': {'status': 'FAIL'}})),
            ):
                failed = Path(folder) / f'{case}-failed.zip'
                with zipfile.ZipFile(src) as inp, zipfile.ZipFile(failed, 'w') as dst:
                    for item in inp.infolist():
                        original = inp.read(item.filename)
                        data = json.dumps(failed_qa).encode('utf-8') if 'AUTOMATED_QA' in item.filename else original
                        dst.writestr(item, data)
                rejected_output = Path(folder) / f'{case}-bad-output.zip'
                with self.assertRaisesRegex(PackageError, 'not PASS'):
                    repair(failed, rejected_output)
                self.assertFalse(rejected_output.exists())

    def test_video_hash_and_canonical_qa_document(self):
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder)
            source = base / 'p01.zip'
            qa_doc = base / 'latest.md'
            qa_doc.write_text('# Latest QA with MP4\n')
            pdfs = [(f'{n}.pdf', b'%PDF-1.4\n' + bytes([n])) for n in range(2)]
            imgs = [(f'{n}.jpg', b'\xff\xd8' + bytes([n]) + b'\xff\xd9') for n in range(7)]
            video_data = b'\x00\x00\x00\x18ftypisom\x00\x00\x00\x00isom'
            video_name = 'P01_Listing_Video_v1.2.1.mp4'

            def entries(items):
                return [{'filename': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
                        for name, data in items]

            manifest = {
                'product_id': 'P01', 'version': '1.2.1',
                'final_customer_files': entries(pdfs),
                'listing_previews': entries(imgs),
                'listing_video': entries([(video_name, video_data)])[0],
            }
            qa = {
                'product_id': 'P01', 'version': '1.2.1', 'overall_status': 'PASS',
                'checks': {
                    'customer_pdfs': {'status': 'PASS', 'files': entries(pdfs)},
                    'listing_previews': {'status': 'PASS', 'files': entries(imgs)},
                },
            }
            with zipfile.ZipFile(source, 'w') as z:
                z.writestr('P01_MANIFEST_v1.2.1.json', json.dumps(manifest))
                z.writestr('QA_REPORTS/P01_AUTOMATED_QA_v1.2.1.json', json.dumps(qa))
                z.writestr('QA_REPORTS/P01_QA_REPORT_v1.2.1.md', qa_doc.read_bytes())
                for name, data in pdfs:
                    z.writestr('CUSTOMER_FILES/' + name, data)
                for name, data in imgs:
                    z.writestr('LISTING_PREVIEWS/' + name, data)
                z.writestr('LISTING_PREVIEWS/' + video_name, video_data)

            # The real package structure is seven JPEGs plus one MP4, not 7 total.
            verify(source, expected_qa_report=qa_doc)
            qa_doc.write_text('# Updated QA containing new notes\n')
            with self.assertRaisesRegex(PackageError, 'QA Markdown differs'):
                verify(source, expected_qa_report=qa_doc)

            tampered_video = base / 'wrong-video.zip'
            with zipfile.ZipFile(source) as original, zipfile.ZipFile(tampered_video, 'w') as dst:
                for member in original.infolist():
                    data = original.read(member.filename)
                    if member.filename.endswith('.mp4'):
                        data += b'tampered'
                    dst.writestr(member, data)
            with self.assertRaisesRegex(PackageError, 'Listing video bytes/SHA-256 mismatch'):
                verify(tampered_video)

            unexpected_member = base / 'extra-image.zip'
            with zipfile.ZipFile(source) as original, zipfile.ZipFile(unexpected_member, 'w') as dst:
                for member in original.infolist():
                    dst.writestr(member, original.read(member))
                dst.writestr('LISTING_PREVIEWS/08_Unexpected.jpg', b'\xff\xd8\xff\xd9')
            with self.assertRaisesRegex(PackageError, 'Unexpected file set'):
                verify(unexpected_member)

    def test_manifest_mismatch_is_not_silently_repaired(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'bad.zip'
            with zipfile.ZipFile(path,'w') as z:
                z.writestr('P01_MANIFEST_v1.2.1.json',json.dumps({'product_id':'P01','version':'1.2.1','final_customer_files':[],'listing_previews':[]}))
                z.writestr('QA_REPORTS/P01_AUTOMATED_QA_v1.2.1.json',json.dumps({'product_id':'P01','version':'1.2.1'}))
                z.writestr('QA_REPORTS/P01_QA_REPORT_v1.2.1.md','md')
            with self.assertRaisesRegex(PackageError,'Expected 2 PDFs'):
                repair(path,Path(folder)/'out.zip')


if __name__=='__main__':
    unittest.main()
