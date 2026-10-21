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
