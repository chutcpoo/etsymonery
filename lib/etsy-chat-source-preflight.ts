import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { validateChatSourceBytes, CHAT_ASSET_MAX_BYTES, CHAT_REQUEST_MAX_BYTES } from "./etsy-chat-asset-intake";
import { inspectBuyerFileBytes } from "./etsy-buyer-byte-integrity";

const ID = /^[A-Za-z0-9_-]{10,200}$/;
const SHA = /^[a-f0-9]{64}$/;
const PRODUCT = /^[A-Z0-9][A-Z0-9._-]*$/;
const AUTH_HEADER = "x-autodigitalpublisher-write-token";
type Kind = "UPLOAD_FILE" | "UPLOAD_IMAGE";
type SourceInput = {
  action: "SOURCE_PREFLIGHT";
  sourceRootId: string;
  productId: string;
  driveFileId: string;
  assetName: string;
  expectedSha256: string;
  expectedBytes: number;
  kind: Kind;
  rank: number;
};
function reject(status: number, error: string) {
  return NextResponse.json({status:"BLOCKED",error,mode:"READ_ONLY",
    sourceDriveIdVerifiedByServer:false,ETSY_WRITE_COUNT:0}, {
      status,headers:{"cache-control":"no-store"}
    });
}
function str(v:unknown, error:string) {
  if(typeof v!=="string" || !v.trim())throw new Error(error);
  return v.normalize("NFC").trim();
}
export function parseSourcePreflight(raw:unknown): SourceInput {
  if(!raw || typeof raw!=="object" || Array.isArray(raw))throw new Error("INVALID_SOURCE_PREFLIGHT");
  const x=raw as Record<string,unknown>;
  if(x.action!=="SOURCE_PREFLIGHT")throw new Error("SOURCE_PREFLIGHT_ONLY");
  const sourceRootId=str(x.sourceRootId,"INVALID_ROOT_ID");
  const driveFileId=str(x.driveFileId,"INVALID_DRIVE_FILE_ID");
  const productId=str(x.productId,"INVALID_PRODUCT_ID");
  const assetName=str(x.assetName,"INVALID_ASSET_NAME");
  const expectedSha256=str(x.expectedSha256,"INVALID_ASSET_SHA");
  if(!ID.test(sourceRootId)||!ID.test(driveFileId)||!PRODUCT.test(productId)||
      !SHA.test(expectedSha256) || assetName.length > 150 ||
      /[/\\\r\n]/.test(assetName))throw new Error("INVALID_SOURCE_IDENTITY");
  if(x.kind!=="UPLOAD_FILE"&&x.kind!=="UPLOAD_IMAGE")throw new Error("INVALID_ASSET_KIND");
  const kind=x.kind as Kind;
  if(typeof x.expectedBytes!=="number" || !Number.isSafeInteger(x.expectedBytes)||
    x.expectedBytes<1 || x.expectedBytes>CHAT_ASSET_MAX_BYTES)throw new Error("INVALID_ASSET_SIZE");
  if(typeof x.rank!=="number"||!Number.isSafeInteger(x.rank)||
      x.rank<1 || x.rank>(kind==="UPLOAD_IMAGE"?10:5))throw new Error("INVALID_ASSET_RANK");
  return {action:"SOURCE_PREFLIGHT",sourceRootId,productId,driveFileId,
    assetName,expectedSha256,expectedBytes:x.expectedBytes,kind,rank:x.rank};
}
function authorization(request:Request) {
  const expected=process.env.ETSY_CHAT_SOURCE_PREFLIGHT_TOKEN?.trim();
  if(!expected)return reject(503,"OPERATOR_TOKEN_NOT_CONFIGURED");
  const supplied=request.headers.get(AUTH_HEADER)?.trim() ?? "";
  const a=Buffer.from(supplied),b=Buffer.from(expected);
  if(!supplied||a.length!==b.length||!timingSafeEqual(a,b))return reject(401,"UNAUTHORIZED");
  return null;
}
export function createSourcePreflightPostHandler() {
  return async (request:Request):Promise<Response>=>{
    const denied=authorization(request);
    if(denied)return denied;
    const contentLength=request.headers.get("content-length");
    if(contentLength && (!/^\d+$/.test(contentLength)||
       Number(contentLength)>CHAT_REQUEST_MAX_BYTES))return reject(413,"REQUEST_TOO_LARGE");
    if(!request.headers.get("content-type")?.startsWith("multipart/form-data;"))return reject(415,"MULTIPART_REQUIRED");
    let source:SourceInput,asset:File;
    try {
      const form=await request.formData();
      const manifest=form.get("manifest");
      const file=form.get("asset");
      if(typeof manifest!=="string"||manifest.length>8000||!(file instanceof File))return reject(400,"INVALID_MULTIPART");
      source=parseSourcePreflight(JSON.parse(manifest));
      asset=file;
    } catch (error) {return reject(400,error instanceof Error?error.message:"INVALID_SOURCE_PREFLIGHT");}
    if(!process.env.GOOGLE_DRIVE_SOURCE_ROOT_ID||
        source.sourceRootId!==process.env.GOOGLE_DRIVE_SOURCE_ROOT_ID)
      return reject(403,"UNAPPROVED_SOURCE_ROOT");
    if(asset.size>CHAT_ASSET_MAX_BYTES)return reject(413,"SOURCE_FILE_TOO_LARGE");
    let bytes:Uint8Array;
    try{bytes=new Uint8Array(await asset.arrayBuffer());}
    catch{return reject(400,"SOURCE_BYTES_UNREADABLE");}
    const invalid=validateChatSourceBytes(source,asset,bytes);
    if(invalid)return reject(409,invalid);
    return NextResponse.json({
      status:"SOURCE_BYTES_VERIFIED",action:"SOURCE_PREFLIGHT",mode:"READ_ONLY",
      productId:source.productId,sourceRootId:source.sourceRootId,
      driveFileId:source.driveFileId,assetName:source.assetName,
      kind:source.kind,rank:source.rank,
      sha256:source.expectedSha256,sizeBytes:source.expectedBytes,
      sourceDriveIdVerifiedByServer:false,
      bytesVerifiedAgainstExpectedSha256:true,
      buyerBytesCheckLevel:source.kind==="UPLOAD_FILE"
        ? inspectBuyerFileBytes(source.assetName,bytes).level
        : "IMAGE_SIGNATURE_ONLY",
      pdfRenderedAndVisuallyReviewed:false,
      independentFinalQCVerified:false,draftCreated:false,
      publishAuthorized:false,ETSY_WRITE_COUNT:0
    },{headers:{"cache-control":"no-store"}});
  };
}
