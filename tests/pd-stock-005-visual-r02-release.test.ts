import assert from "node:assert/strict";
import test from "node:test";
import { PD_STOCK_005_VISUAL_R02_RELEASE, exactPdStock005R02AuthorizationHash } from "../lib/pd-stock-005-visual-r02-release";

test("PD-STOCK-005 R02 frozen release identity is exact",()=>{
  const r=PD_STOCK_005_VISUAL_R02_RELEASE;
  assert.equal(r.operationId,"PD-STOCK-005-VISUAL-R02-RELEASE-001");
  assert.equal(r.listingId,"4561821192");
  assert.equal(r.productId,"PD-STOCK-005");
  assert.equal(r.operation,"REPLACE_GALLERY_8_ALT_TEXT_8_PRESERVE_VIDEO_COUNT_0_ONLY");
  assert.equal(r.operationFingerprint,"ea0a9759ff0925d2c908f0605ab2473eeae995c93d77c33fa7c310558661953e");
  assert.equal(r.candidateFingerprint,"f7939f5cf44b19ffa7c76e6fe7b0fb31644517a1e323490e12d09c46f77346b9");
  assert.equal(r.expectedVideoCount,0);
  assert.equal(r.gallery.length,8);
  assert.equal(r.productTruth.buyerZipSha256,"3841d6260b1e41d987338b247c955235fc0085380d1a2c75420e23df5f9bfc22");
  assert.equal(r.productTruth.innerWorkbookSha256,"95c7b9a18e1f9ed9403ec0f3b47c02c086bdc321632f1ec5aa11640befe783d1");
  for(const [i,a] of r.gallery.entries()){
    assert.equal(a.order,i+1);
    assert.equal(a.width,2500);
    assert.equal(a.height,2000);
    assert.match(a.sha256,/^[a-f0-9]{64}$/);
    assert.ok(a.byteSize>0&&a.byteSize<1_000_000);
    assert.ok(a.altText.length>0&&a.altText.length<=250);
  }
});

test("PD-STOCK-005 R02 authorization hash is bound to fresh PSV",()=>{
  const a=exactPdStock005R02AuthorizationHash("a".repeat(64));
  const b=exactPdStock005R02AuthorizationHash("b".repeat(64));
  assert.match(a,/^[a-f0-9]{64}$/);
  assert.match(b,/^[a-f0-9]{64}$/);
  assert.notEqual(a,b);
});
