import { NextResponse } from "next/server";
import { PD_REST_003_A02 } from "../../../../../../lib/pd-rest-003-a02-title-tags-image1";
import { PDT_BOBA_001_C03_GALLERY_REPAIR } from "../../../../../../lib/pdt-boba-001-c03-gallery-mobile-safe-repair";
import { PDT_BOBA_001_B01_BUYER_FILES } from "../../../../../../lib/pdt-boba-001-b01-buyer-files";
import { PDT_BPSC_001_C09, PDT_BPSC_001_C09_ASSETS } from "../../../../../../lib/pdt-bpsc-001-c09-new-listing";
import { stageAuthorizedAssetChunk } from "../../../../../../lib/authorized-operation-asset-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ISSUER="https://token.actions.githubusercontent.com";
const AUDIENCE="https://autodigitalpublisher.vercel.app/api/internal/etsy/authorized-operation/asset-chunk";
const REPOSITORY="chutcpoo/etsymonery";
const REF="refs/heads/main";
const EVENT="workflow_dispatch";
const WORKFLOW_REF="chutcpoo/etsymonery/.github/workflows/execute-authorized-etsy-operation.yml@refs/heads/main";
type Claims={iss?:string;aud?:string|string[];exp?:number;nbf?:number;repository?:string;ref?:string;event_name?:string;workflow_ref?:string};
type Jwk=JsonWebKey&{kid?:string};
function decode<T>(s:string){return JSON.parse(Buffer.from(s,"base64url").toString("utf8")) as T;}
function audienceMatches(aud:Claims["aud"]){return typeof aud==="string"?aud===AUDIENCE:Array.isArray(aud)&&aud.includes(AUDIENCE);}

async function verify(token:string){
  const parts=token.split(".");if(parts.length!==3)throw new Error("AUTHORIZED_ETSY_OIDC_MALFORMED");
  const [h,c,s]=parts, header=decode<{alg?:string;kid?:string}>(h), claims=decode<Claims>(c);
  if(header.alg!=="RS256"||!header.kid)throw new Error("AUTHORIZED_ETSY_OIDC_HEADER_INVALID");
  const now=Math.floor(Date.now()/1000);
  if(claims.iss!==ISSUER||!audienceMatches(claims.aud)||!claims.exp||claims.exp<now-30||(claims.nbf&&claims.nbf>now+30)||claims.repository!==REPOSITORY||claims.ref!==REF||claims.event_name!==EVENT||claims.workflow_ref!==WORKFLOW_REF)throw new Error("AUTHORIZED_ETSY_OIDC_CLAIMS_INVALID");
  const discovery=await fetch(`${ISSUER}/.well-known/openid-configuration`,{cache:"no-store"});if(!discovery.ok)throw new Error("AUTHORIZED_ETSY_OIDC_DISCOVERY_FAILED");
  const {jwks_uri}=await discovery.json() as {jwks_uri?:string};if(!jwks_uri)throw new Error("AUTHORIZED_ETSY_OIDC_JWKS_URI_MISSING");
  const jr=await fetch(jwks_uri,{cache:"no-store"});if(!jr.ok)throw new Error("AUTHORIZED_ETSY_OIDC_JWKS_FAILED");
  const keys=(await jr.json() as {keys?:Jwk[]}).keys??[], key=keys.find(k=>k.kid===header.kid&&k.kty==="RSA");if(!key)throw new Error("AUTHORIZED_ETSY_OIDC_KEY_NOT_FOUND");
  const publicKey=await crypto.subtle.importKey("jwk",key,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
  const ok=await crypto.subtle.verify("RSASSA-PKCS1-v1_5",publicKey,Buffer.from(s,"base64url"),new TextEncoder().encode(`${h}.${c}`));if(!ok)throw new Error("AUTHORIZED_ETSY_OIDC_SIGNATURE_INVALID");
}

export async function POST(request:Request){
  const authorization=request.headers.get("authorization")?.trim()??"";
  if(!authorization.startsWith("Bearer "))return NextResponse.json({error:"AUTHORIZED_ETSY_OIDC_MISSING"},{status:401});
  try{await verify(authorization.slice(7).trim());}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"AUTHORIZED_ETSY_OIDC_INVALID"},{status:401});}
  let value:unknown;try{value=await request.json();}catch{return NextResponse.json({error:"INVALID_JSON"},{status:400});}
  if(!value||typeof value!=="object"||Array.isArray(value))return NextResponse.json({error:"INVALID_BODY"},{status:400});

  const body=value as Record<string,unknown>;
  const operationId=typeof body.operationId==="string"?body.operationId:"";
  const confirmation=typeof body.confirmation==="string"?body.confirmation:"";
  const requestedAssetSha256=typeof body.assetSha256==="string"?body.assetSha256:"";
  if(!operationId||confirmation!==operationId)return NextResponse.json({error:"AUTHORIZED_ETSY_CONFIRMATION_MISMATCH"},{status:409});

  let registeredAssetSha256="";
  if(operationId===PD_REST_003_A02.operationId){
    if(requestedAssetSha256&&requestedAssetSha256!==PD_REST_003_A02.image.sha256)return NextResponse.json({error:"AUTHORIZED_ETSY_ASSET_NOT_REGISTERED"},{status:409});
    registeredAssetSha256=PD_REST_003_A02.image.sha256;
  }else if(operationId===PDT_BOBA_001_C03_GALLERY_REPAIR.operationId){
    const asset=PDT_BOBA_001_C03_GALLERY_REPAIR.gallery.find(candidate=>candidate.sha256===requestedAssetSha256);
    if(!asset)return NextResponse.json({error:"AUTHORIZED_ETSY_ASSET_NOT_REGISTERED"},{status:409});
    registeredAssetSha256=asset.sha256;
  }else if(operationId===PDT_BOBA_001_B01_BUYER_FILES.operationId){
    const asset=PDT_BOBA_001_B01_BUYER_FILES.targets.find(candidate=>candidate.sha256===requestedAssetSha256);
    if(!asset)return NextResponse.json({error:"AUTHORIZED_ETSY_ASSET_NOT_REGISTERED"},{status:409});
    registeredAssetSha256=asset.sha256;
  }else if(operationId===PDT_BPSC_001_C09.operationId){
    const asset=PDT_BPSC_001_C09_ASSETS.find(candidate=>candidate.sha256===requestedAssetSha256);
    if(!asset)return NextResponse.json({error:"AUTHORIZED_ETSY_ASSET_NOT_REGISTERED"},{status:409});
    registeredAssetSha256=asset.sha256;
  }else{
    return NextResponse.json({error:"AUTHORIZED_ETSY_OPERATION_NOT_REGISTERED"},{status:409});
  }

  const chunkIndex=Number(body.chunkIndex), chunkCount=Number(body.chunkCount), dataBase64=typeof body.dataBase64==="string"?body.dataBase64:"";
  try{await stageAuthorizedAssetChunk({operationId,assetSha256:registeredAssetSha256,chunkIndex,chunkCount,dataBase64});}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:"ASSET_STAGE_FAILED",ETSY_WRITE_COUNT:0},{status:409});}
  return NextResponse.json({status:"ASSET_CHUNK_STAGED",operationId,chunkIndex,chunkCount,assetSha256:registeredAssetSha256,ETSY_WRITE_COUNT:0});
}
