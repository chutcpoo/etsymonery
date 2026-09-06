import { createHash, timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";
import { etsyApiHeaders } from "../../../../../lib/etsy";
import { getValidEtsyAccessToken } from "../../../../../lib/etsy-auth";
import { verifyEtsyReadBackIdentity, type EtsyReadBackObservation } from "../../../../../lib/etsy-readback-normalizer";
import { beginOperation, NeonOperationLedgerRepository, recordOperationResult } from "../../../../../lib/operation-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHOP_ID = 23582741;
const LISTING_ID = 4560696421;
const BUILD_ID = "ETSY-RESET-V1-PDT-BOBA-001-BUILD-20260906-B01";
const BUILD_FREEZE_SHA256 = "9b9b0b070d01cb272bad5463dc91592cbd6304794c6ad125f0b9ddfce22d5038";
const ACCEPTANCE_CRITERIA_SHA256 = "2933a096363420086b941cd24dcf3d04285deaa0ffd40beffabcf4598233b66e";
const CANDIDATE_FINGERPRINT = "e478bf31dc1a4c92ed0be9318d076db047c17afbd38b58cad0e7f2557eb40041";
const WRITE_HEADER = "x-autodigitalpublisher-b01-token";
const EXPECTED_LISTING_FINGERPRINT = "579082255da2638298fcc919c8c89830f039ae708c1d69ba2a28c3efd6ba4dba";
const MAX_CHUNK_BYTES = 2_200_000;

const GALLERY = {
  1: ["PDT-BOBA-001_RESET_V1_GALLERY_01.png", "608ae3875ee0a833a3ce311a8dbb234c76634ad85760c03a907985ae0748e5d5"],
  2: ["PDT-BOBA-001_RESET_V1_GALLERY_02.png", "bb50094ae1760d0520e03a7c7c3f385e191227bdd318c14028f87e5628466f6c"],
  3: ["PDT-BOBA-001_RESET_V1_GALLERY_03.png", "25459e39a12efa0fab9b17dcd0f6bfc813008f7d3b2c9bcce8073f1751f84be6"],
  4: ["PDT-BOBA-001_RESET_V1_GALLERY_04.png", "460e61139f6ae8c0109c28c888c9d0131d48625bb4eda75d373dbdb35c1503c6"],
  5: ["PDT-BOBA-001_RESET_V1_GALLERY_05.png", "2539da54698551b37c53ade4b87af7aeed617e43819ac378c6d081a7fa2fd496"],
  6: ["PDT-BOBA-001_RESET_V1_GALLERY_06.png", "bd333195cb2c9fa5cad966329c59115b5c64ba327219c8f2d7e0cd28e50e86da"],
  7: ["PDT-BOBA-001_RESET_V1_GALLERY_07.png", "1d688b51043f288d836eb95bd684c0083dd71e6751e3305d7f529d3704f2ee93"],
  8: ["PDT-BOBA-001_RESET_V1_GALLERY_08.png", "621959b4c7ebec997d4d7541a2caae3243a6c15916bf71fa8496c8e3d22fffde"],
  9: ["PDT-BOBA-001_RESET_V1_GALLERY_09.png", "806a8035d2e60b5cd232d0670b65eeb5e55c6f4450babb4fe10cf1e82cd962a7"],
  10: ["PDT-BOBA-001_RESET_V1_GALLERY_10.png", "fe9e6c202c96be7c67d41669bb1bec712a09c3e893cb203add25183094d4e845"]
} as const;

type GalleryRank = keyof typeof GALLERY;
function isRecord(v: unknown): v is Record<string, unknown> { return typeof v === "object" && v !== null && !Array.isArray(v); }
function secureEqual(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
function sql(){const url=process.env.DATABASE_URL?.trim();if(!url)throw new Error("DATABASE_URL_NOT_CONFIGURED");return neon(url);}
async function parseJson(r:Response){const t=await r.text();if(!t)return {};try{return JSON.parse(t) as unknown;}catch{return {};}}
function observation(v:Record<string,unknown>):EtsyReadBackObservation{return{title:v.title,description:v.description,price:v.price as EtsyReadBackObservation["price"],tags:v.tags,quantity:v.quantity,who_made:v.who_made,when_made:v.when_made,taxonomy_id:v.taxonomy_id,type:v.listing_type??v.type??"download",state:"draft"};}
function authError(req:Request){const expected=process.env.ETSY_B01_WRITE_TOKEN?.trim()??"";const supplied=req.headers.get(WRITE_HEADER)?.trim()??"";if(!expected)return NextResponse.json({error:"ETSY_B01_WRITE_AUTH_NOT_CONFIGURED"},{status:503});if(!supplied||!secureEqual(supplied,expected))return NextResponse.json({error:"ETSY_B01_WRITE_UNAUTHORIZED"},{status:401});return null;}
async function ensureChunks(){const q=sql();await q`CREATE TABLE IF NOT EXISTS b01_image_upload_chunks(rank integer NOT NULL, chunk_index integer NOT NULL, chunk_count integer NOT NULL, asset_sha256 text NOT NULL, data_base64 text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(rank, chunk_index))`;}
async function fetchListing(token:string){const r=await fetch(`https://api.etsy.com/v3/application/listings/${LISTING_ID}`,{headers:etsyApiHeaders(token),cache:"no-store"});const v=await parseJson(r);if(!r.ok||!isRecord(v))throw new Error(`ETSY_B01_READ_FAILED:${r.status}`);return v;}
async function fetchImages(token:string){const r=await fetch(`https://api.etsy.com/v3/application/listings/${LISTING_ID}/images`,{headers:etsyApiHeaders(token),cache:"no-store"});const v=await parseJson(r);if(!r.ok||!isRecord(v)||!Array.isArray(v.results))throw new Error(`ETSY_B01_IMAGE_READ_FAILED:${r.status}`);return v.results.filter(isRecord);}

export async function POST(req:Request){
  if(process.env.PUBLISH_WRITES_ENABLED!=="true")return NextResponse.json({error:"ETSY_B01_WRITES_DISABLED"},{status:403});
  const ae=authError(req);if(ae)return ae;
  let body:unknown;try{body=await req.json();}catch{return NextResponse.json({error:"INVALID_JSON"},{status:400});}
  if(!isRecord(body))return NextResponse.json({error:"INVALID_BODY"},{status:400});
  const action=String(body.action??"");const rank=Number(body.rank);
  if(!Number.isSafeInteger(rank)||rank<1||rank>10||!(rank in GALLERY))return NextResponse.json({error:"INVALID_B01_IMAGE_RANK"},{status:400});
  const [assetName,assetSha256]=GALLERY[rank as GalleryRank];
  await ensureChunks();const q=sql();
  if(action==="chunk"){
    const chunkIndex=Number(body.chunkIndex),chunkCount=Number(body.chunkCount),dataBase64=typeof body.dataBase64==="string"?body.dataBase64:"";
    if(!Number.isSafeInteger(chunkIndex)||chunkIndex<0||!Number.isSafeInteger(chunkCount)||chunkCount<1||chunkCount>8||chunkIndex>=chunkCount||!dataBase64)return NextResponse.json({error:"INVALID_B01_CHUNK"},{status:400});
    let bytes:Buffer;try{bytes=Buffer.from(dataBase64,"base64");}catch{return NextResponse.json({error:"INVALID_B01_CHUNK_BASE64"},{status:400});}
    if(bytes.length===0||bytes.length>MAX_CHUNK_BYTES)return NextResponse.json({error:"B01_CHUNK_SIZE_INVALID",bytes:bytes.length},{status:413});
    await q`INSERT INTO b01_image_upload_chunks(rank,chunk_index,chunk_count,asset_sha256,data_base64) VALUES(${rank},${chunkIndex},${chunkCount},${assetSha256},${dataBase64}) ON CONFLICT(rank,chunk_index) DO UPDATE SET chunk_count=EXCLUDED.chunk_count,asset_sha256=EXCLUDED.asset_sha256,data_base64=EXCLUDED.data_base64,created_at=now()`;
    return NextResponse.json({status:"CHUNK_STORED",rank,chunkIndex,chunkCount,bytes:bytes.length});
  }
  if(action==="cleanup"){await q`DELETE FROM b01_image_upload_chunks WHERE rank=${rank}`;return NextResponse.json({status:"CHUNKS_CLEARED",rank});}
  if(action!=="commit")return NextResponse.json({error:"INVALID_B01_CHUNK_ACTION"},{status:400});

  const rows=await q`SELECT chunk_index,chunk_count,asset_sha256,data_base64 FROM b01_image_upload_chunks WHERE rank=${rank} ORDER BY chunk_index ASC` as any[];
  if(rows.length===0)return NextResponse.json({error:"B01_CHUNKS_MISSING"},{status:409});
  const count=Number(rows[0].chunk_count);if(rows.length!==count||rows.some((r,i)=>Number(r.chunk_index)!==i||Number(r.chunk_count)!==count||String(r.asset_sha256)!==assetSha256))return NextResponse.json({error:"B01_CHUNK_SET_MISMATCH",found:rows.length,expected:count},{status:409});
  const bytes=Buffer.concat(rows.map(r=>Buffer.from(String(r.data_base64),"base64")));const actualSha=createHash("sha256").update(bytes).digest("hex");if(actualSha!==assetSha256)return NextResponse.json({error:"B01_IMAGE_BYTES_MISMATCH",expectedSha256:assetSha256,actualSha256:actualSha},{status:409});

  const token=await getValidEtsyAccessToken();const listing=await fetchListing(token);if(String(listing.state??"").toLowerCase()!=="active")return NextResponse.json({error:"ETSY_TARGET_NOT_ACTIVE"},{status:409});
  const identity=verifyEtsyReadBackIdentity(EXPECTED_LISTING_FINGERPRINT,observation(listing));if(identity.status!=="MATCH")return NextResponse.json({error:"ETSY_B01_LISTING_IDENTITY_MISMATCH",actualFingerprint:identity.actualFingerprint},{status:409});
  const operationId=`B01-IMAGE-${String(rank).padStart(2,"0")}`;const operationPayload={operation:"OVERWRITE_ACTIVE_LISTING_IMAGE",operationId,buildId:BUILD_ID,buildFreezeSha256:BUILD_FREEZE_SHA256,acceptanceCriteriaSha256:ACCEPTANCE_CRITERIA_SHA256,candidateFingerprint:CANDIDATE_FINGERPRINT,shopId:String(SHOP_ID),listingId:String(LISTING_ID),expectedListingFingerprint:EXPECTED_LISTING_FINGERPRINT,assetName,assetSha256,rank};
  const ledger=new NeonOperationLedgerRepository();const begun=await beginOperation(ledger,operationId,operationPayload,new Date().toISOString());if(begun.status==="REPLAY"){if(begun.record.status==="SUCCEEDED"){await q`DELETE FROM b01_image_upload_chunks WHERE rank=${rank}`;return NextResponse.json({status:"REPLAY",operationId,requestHash:begun.record.requestHash,receipt:begun.record.receipt});}return NextResponse.json({error:"B01_IMAGE_ALREADY_CLAIMED",operationId,ledgerStatus:begun.record.status},{status:409});}

  const beforeImages=await fetchImages(token);const prior=beforeImages.find(x=>Number(x.rank)===rank);const form=new FormData();form.append("image",new File([bytes],assetName,{type:"image/png"}),assetName);form.append("rank",String(rank));form.append("overwrite","true");const headers=etsyApiHeaders(token);delete headers["content-type"];
  let r:Response;try{r=await fetch(`https://api.etsy.com/v3/application/shops/${SHOP_ID}/listings/${LISTING_ID}/images`,{method:"POST",headers,body:form,cache:"no-store"});}catch{const pending=await recordOperationResult(ledger,operationId,begun.record.requestHash,"RECONCILIATION_REQUIRED",new Date().toISOString(),{recoveryPoint:"IMAGE_UPLOAD_READBACK"});return NextResponse.json({error:"B01_IMAGE_UPLOAD_AMBIGUOUS",requestHash:pending.requestHash},{status:202});}
  const provider=await parseJson(r);if(!r.ok||!isRecord(provider)){const failed=await recordOperationResult(ledger,operationId,begun.record.requestHash,"FAILED",new Date().toISOString(),{recoveryPoint:"IMAGE_UPLOAD_REJECTED",receipt:{providerStatusCode:r.status,providerError:provider}});return NextResponse.json({error:"B01_IMAGE_UPLOAD_REJECTED",statusCode:r.status,providerError:provider,requestHash:failed.requestHash},{status:502});}
  const uploadedId=String(provider.listing_image_id??"");const after=await fetchImages(token);const atRank=after.find(x=>Number(x.rank)===rank);if(!uploadedId||String(atRank?.listing_image_id??"")!==uploadedId||String(prior?.listing_image_id??"")===uploadedId){const pending=await recordOperationResult(ledger,operationId,begun.record.requestHash,"RECONCILIATION_REQUIRED",new Date().toISOString(),{recoveryPoint:"IMAGE_POSTREAD_MISMATCH"});return NextResponse.json({error:"B01_IMAGE_POSTREAD_MISMATCH",requestHash:pending.requestHash},{status:202});}
  const done=await recordOperationResult(ledger,operationId,begun.record.requestHash,"SUCCEEDED",new Date().toISOString(),{receipt:{providerResourceId:uploadedId,rank,assetName,assetSha256,overwrite:true}});await q`DELETE FROM b01_image_upload_chunks WHERE rank=${rank}`;return NextResponse.json({status:"UPDATED_AND_VERIFIED",operationId,requestHash:done.requestHash,receipt:done.receipt});
}
