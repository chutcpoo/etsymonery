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

    def test_video_is_verified_without_counting_it_as_an_eighth_jpeg(self):
        with tempfile.TemporaryDirectory() as folder:
            pdfs = [(f'pdf{i}.pdf', b'%PDF-1.4\n' + bytes([i])) for i in range(2)]
            imgs = [(f'{i}.jpg', b'\xff\xd8' + bytes([i]) + b'\xff\xd9') for i in range(7)]
            video = ('video.mp4', b'\x00\x00\x00\x18ftypisomoriginal')
            def rows(items):
                return [{'filename':n, 'bytes':len(b), 'sha256':hashlib.sha256(b).hexdigest()} for n,b in items]
            manifest = {'product_id':'P01', 'version':'1.2.1',
                        'final_customer_files':rows(pdfs), 'listing_previews':rows(imgs),
                        'listing_video':rows([video])[0]}
            qa = {'product_id':'P01', 'version':'1.2.1', 'overall_status':'PASS',
                  'checks':{'customer_pdfs':{'status':'PASS','files':rows(pdfs)},
                            'listing_previews':{'status':'PASS','files':rows(imgs)}}}
            def package(path, video_bytes, extra=False, manifest_override=None):
                with zipfile.ZipFile(path, 'w') as z:
                    z.writestr('P01_MANIFEST_v1.2.1.json', json.dumps(manifest_override or manifest))
                    z.writestr('QA_REPORTS/P01_AUTOMATED_QA_v1.2.1.json', json.dumps(qa))
                    z.writestr('QA_REPORTS/P01_QA_REPORT_v1.2.1.md', '# QA')
                    for n,b in pdfs: z.writestr('CUSTOMER_FILES/'+n,b)
                    for n,b in imgs: z.writestr('LISTING_PREVIEWS/'+n,b)
                    if video_bytes is not None: z.writestr('LISTING_PREVIEWS/video.mp4',video_bytes)
                    if extra: z.writestr('LISTING_PREVIEWS/unlisted.mp4',video[1])
            good = Path(folder)/'good.zip'
            package(good,video[1]); verify(good)
            for label, payload, extra in [('changed',video[1]+b'x',False),
                                          ('missing',None,False),('extra',video[1],True)]:
                path=Path(folder)/(label+'.zip'); package(path,payload,extra)
                with self.assertRaises(PackageError): verify(path)
            # Even a matching hash cannot make a non-MP4 payload a valid video.
            invalid=b'not an mp4 file at all'
            bad=Path(folder)/'invalid.zip'
            package(bad,invalid,manifest_override={**manifest,'listing_video':rows([('video.mp4',invalid)])[0]})
            with self.assertRaisesRegex(PackageError,'Invalid MP4'): verify(bad)

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
