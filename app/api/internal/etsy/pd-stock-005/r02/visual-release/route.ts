import { NextResponse } from "next/server";
import { PD_STOCK_005_VISUAL_R02_RELEASE, handlePdStock005R02Release, verifyPdStock005R02ProtectedState } from "../../../../../../../lib/pd-stock-005-visual-r02-release";
import { stageAuthorizedAssetChunk } from "../../../../../../../lib/authorized-operation-asset-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ISSUER = "https://token.actions.githubusercontent.com";
const AUDIENCE = "https://autodigitalpublisher.vercel.app/api/internal/etsy/pd-stock-005/r02/visual-release";
const REPOSITORY = "chutcpoo/etsymonery";
const REF = "refs/heads/pd-stock-005-release-runner";
const EVENT = "push";
const WORKFLOW_REF = "chutcpoo/etsymonery/.github/workflows/pd-stock-005-r02-release-runner.yml@refs/heads/pd-stock-005-release-runner";

type Header={alg?:string;kid?:string};
type Claims={iss?:string;aud?:string|string[];exp?:number;nbf?:number;repository?:string;ref?:string;event_name?:string;workflow_ref?:string};
type Jwk=JsonWebKey&{kid?:string};
const decode=<T,>(s:string)=>JSON.parse(Buffer.from(s,"base64url").toString("utf8")) as T;
const audOk=(aud:Claims["aud"])=>typeof aud==="string"?aud===AUDIENCE:Array.isArray(aud)&&aud.includes(AUDIENCE);

async function verifyOidc(token:string){
  const parts=token.split(".");if(parts.length!==3)throw new Error("PD_STOCK_R02_OIDC_MALFORMED");
  const [h,c,s]=parts,header=decode<Header>(h),claims=decode<Claims>(c);
  if(header.alg!=="RS256"||!header.kid)throw new Error("PD_STOCK_R02_OIDC_HEADER_INVALID");
  if(claims.iss!==ISSUER||!audOk(claims.aud))throw new Error("PD_STOCK_R02_OIDC_ORIGIN_INVALID");
  const now=Math.floor(Date.now()/1000);if(!claims.exp||claims.exp<now-30||(claims.nbf&&claims.nbf>now+30))throw new Error("PD_STOCK_R02_OIDC_TIME_INVALID");
  if(claims.repository!==REPOSITORY||claims.ref!==REF||claims.event_name!==EVENT||claims.workflow_ref!==WORKFLOW_REF)throw new Error("PD_STOCK_R02_OIDC_SCOPE_INVALID");
  const discovery=await fetch(`${ISSUER}/.well-known/openid-configuration`,{cache:"no-store"});if(!discovery.ok)throw new Error("PD_STOCK_R02_OIDC_DISCOVERY_FAILED");
  const cfg=await discovery.json() as {jwks_uri?:string};if(!cfg.jwks_uri)throw new Error("PD_STOCK_R02_OIDC_JWKS_URI_MISSING");
  const jr=await fetch(cfg.jwks_uri,{cache:"no-store"});if(!jr.ok)throw new Error("PD_STOCK_R02_OIDC_JWKS_FAILED");
  const keys=(await jr.json() as {keys?:Jwk[]}).keys??[],key=keys.find(k=>k.kid===header.kid&&k.kty==="RSA");if(!key)throw new Error("PD_STOCK_R02_OIDC_KEY_NOT_FOUND");
  const pk=await crypto.subtle.importKey("jwk",key,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
  const valid=await crypto.subtle.verify("RSASSA-PKCS1-v1_5",pk,Buffer.from(s,"base64url"),new TextEncoder().encode(`${h}.${c}`));if(!valid)throw new Error("PD_STOCK_R02_OIDC_SIGNATURE_INVALID");
}

export async function POST(request:Request){
  const authorization=request.headers.get("authorization")?.trim()??"";
  if(!authorization.startsWith("Bearer "))return NextResponse.json({error:"PD_STOCK_R02_OIDC_MISSING",ETSY_WRITE_COUNT:0},{status:401});
  try{await verifyOidc(authorization.slice(7).trim())}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"PD_STOCK_R02_OIDC_INVALID",ETSY_WRITE_COUNT:0},{status:401})}
  let payload:unknown;try{payload=await request.json()}catch{return NextResponse.json({error:"PD_STOCK_R02_INVALID_JSON",ETSY_WRITE_COUNT:0},{status:400})}
  if(!payload||typeof payload!=="object"||Array.isArray(payload))return NextResponse.json({error:"PD_STOCK_R02_INVALID_PAYLOAD",ETSY_WRITE_COUNT:0},{status:400});
  const input=payload as Record<string,unknown>,operationId=typeof input.operationId==="string"?input.operationId:"",confirmation=typeof input.confirmation==="string"?input.confirmation:"",action=typeof input.action==="string"?input.action:"verify_protected_state";
  if(operationId!==PD_STOCK_005_VISUAL_R02_RELEASE.operationId||confirmation!==operationId)return NextResponse.json({error:"PD_STOCK_R02_OPERATION_CONFIRMATION_MISMATCH",ETSY_WRITE_COUNT:0},{status:409});

  if(action==="stage_asset_chunk"){
    const assetSha256=typeof input.assetSha256==="string"?input.assetSha256.trim().toLowerCase():"",registered=PD_STOCK_005_VISUAL_R02_RELEASE.gallery.some(a=>a.sha256===assetSha256);
    if(!registered)return NextResponse.json({error:"PD_STOCK_R02_STAGE_ASSET_NOT_REGISTERED",ETSY_WRITE_COUNT:0},{status:409});
    const chunkIndex=Number(input.chunkIndex),chunkCount=Number(input.chunkCount),dataBase64=typeof input.dataBase64==="string"?input.dataBase64:"";
    try{await stageAuthorizedAssetChunk({operationId,assetSha256,chunkIndex,chunkCount,dataBase64})}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"PD_STOCK_R02_STAGE_FAILED",ETSY_WRITE_COUNT:0},{status:409})}
    return NextResponse.json({status:"ASSET_CHUNK_STAGED",operationId,assetSha256,chunkIndex,chunkCount,ETSY_WRITE_COUNT:0});
  }
  if(action==="verify_protected_state")return verifyPdStock005R02ProtectedState();
  if(action!=="execute")return NextResponse.json({error:"PD_STOCK_R02_INVALID_ACTION",ETSY_WRITE_COUNT:0},{status:409});
  const psv=typeof input.protectedStateFingerprint==="string"?input.protectedStateFingerprint.trim().toLowerCase():"",hash=typeof input.authorizationRequestHash==="string"?input.authorizationRequestHash.trim().toLowerCase():"";
  if(!/^[a-f0-9]{64}$/.test(psv)||!/^[a-f0-9]{64}$/.test(hash))return NextResponse.json({error:"PD_STOCK_R02_EXACT_AUTHORIZATION_BINDING_REQUIRED",ETSY_WRITE_COUNT:0},{status:409});
  const writeToken=process.env.ETSY_B01_WRITE_TOKEN?.trim()??"";if(!writeToken)return NextResponse.json({error:"PD_STOCK_R02_WRITE_TOKEN_NOT_CONFIGURED",ETSY_WRITE_COUNT:0},{status:503});
  const delegated=new Request(request.url,{method:"POST",headers:{"content-type":"application/json","x-autodigitalpublisher-write-token":writeToken}});
  return handlePdStock005R02Release(psv,hash,delegated);
}
