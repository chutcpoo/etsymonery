import { NextResponse } from "next/server";
import { hashOperationRequest } from "../../../../../../../../lib/operation-ledger";
import {
  exactPdtBoba001B01ZipUploadRecovery002Body,
  handlePdtBoba001B01ZipUploadRecovery002,
  PDT_BOBA_001_B01_ZIP_UPLOAD_RECOVERY_002,
  verifyPdtBoba001B01ZipUploadRecovery002ProtectedState
} from "../../../../../../../../lib/pdt-boba-001-b01-buyer-files-zip-upload-recovery-002";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ISSUER = "https://token.actions.githubusercontent.com";
const AUDIENCE = "https://autodigitalpublisher.vercel.app/api/internal/etsy/pdt-boba-001/b01/zip-upload-recovery-004";
const REPOSITORY = "chutcpoo/etsymonery";
const REF = "refs/heads/main";
const EVENT = "workflow_dispatch";
const WORKFLOW_REF = "chutcpoo/etsymonery/.github/workflows/execute-boba-zip-upload-recovery-004.yml@refs/heads/main";

type Claims={iss?:string;aud?:string|string[];exp?:number;nbf?:number;repository?:string;ref?:string;event_name?:string;workflow_ref?:string};
type Jwk=JsonWebKey&{kid?:string};
function decode<T>(s:string){return JSON.parse(Buffer.from(s,"base64url").toString("utf8")) as T;}
function audienceMatches(aud:Claims["aud"]){return typeof aud==="string"?aud===AUDIENCE:Array.isArray(aud)&&aud.includes(AUDIENCE);}
async function verifyOidc(token:string){
  const parts=token.split("."); if(parts.length!==3)throw new Error("AUTHORIZED_ETSY_OIDC_MALFORMED");
  const [h,c,s]=parts, header=decode<{alg?:string;kid?:string}>(h), claims=decode<Claims>(c);
  if(header.alg!=="RS256"||!header.kid)throw new Error("AUTHORIZED_ETSY_OIDC_HEADER_INVALID");
  const now=Math.floor(Date.now()/1000);
  if(claims.iss!==ISSUER||!audienceMatches(claims.aud)||!claims.exp||claims.exp<now-30||(claims.nbf&&claims.nbf>now+30)||claims.repository!==REPOSITORY||claims.ref!==REF||claims.event_name!==EVENT||claims.workflow_ref!==WORKFLOW_REF)throw new Error("AUTHORIZED_ETSY_OIDC_CLAIMS_INVALID");
  const discovery=await fetch(`${ISSUER}/.well-known/openid-configuration`,{cache:"no-store"}); if(!discovery.ok)throw new Error("AUTHORIZED_ETSY_OIDC_DISCOVERY_FAILED");
  const {jwks_uri}=await discovery.json() as {jwks_uri?:string}; if(!jwks_uri)throw new Error("AUTHORIZED_ETSY_OIDC_JWKS_URI_MISSING");
  const jr=await fetch(jwks_uri,{cache:"no-store"}); if(!jr.ok)throw new Error("AUTHORIZED_ETSY_OIDC_JWKS_FAILED");
  const key=((await jr.json() as {keys?:Jwk[]}).keys??[]).find(k=>k.kid===header.kid&&k.kty==="RSA"); if(!key)throw new Error("AUTHORIZED_ETSY_OIDC_KEY_NOT_FOUND");
  const publicKey=await crypto.subtle.importKey("jwk",key,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
  const ok=await crypto.subtle.verify("RSASSA-PKCS1-v1_5",publicKey,Buffer.from(s,"base64url"),new TextEncoder().encode(`${h}.${c}`)); if(!ok)throw new Error("AUTHORIZED_ETSY_OIDC_SIGNATURE_INVALID");
}

export async function POST(request:Request){
  const authorization=request.headers.get("authorization")?.trim()??"";
  if(!authorization.startsWith("Bearer "))return NextResponse.json({error:"AUTHORIZED_ETSY_OIDC_MISSING"},{status:401});
  try{await verifyOidc(authorization.slice(7).trim());}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"AUTHORIZED_ETSY_OIDC_INVALID"},{status:401});}
  let value:unknown; try{value=await request.json();}catch{return NextResponse.json({error:"INVALID_JSON"},{status:400});}
  if(!value||typeof value!=="object"||Array.isArray(value))return NextResponse.json({error:"INVALID_BODY"},{status:400});
  const body=value as Record<string,unknown>;
  const operationId=typeof body.operationId==="string"?body.operationId:"";
  const confirmation=typeof body.confirmation==="string"?body.confirmation:"";
  const action=typeof body.action==="string"?body.action:"";
  if(operationId!==PDT_BOBA_001_B01_ZIP_UPLOAD_RECOVERY_002.operationId||confirmation!==operationId)return NextResponse.json({error:"AUTHORIZED_ETSY_CONFIRMATION_MISMATCH"},{status:409});
  if(action==="verify_protected_state")return verifyPdtBoba001B01ZipUploadRecovery002ProtectedState();
  if(action!=="execute")return NextResponse.json({error:"INVALID_ACTION"},{status:409});
  const authorizationId=typeof body.authorizationId==="string"?body.authorizationId.trim():"";
  const authorizationRequestHash=typeof body.authorizationRequestHash==="string"?body.authorizationRequestHash.trim().toLowerCase():"";
  if(!authorizationId||!authorizationRequestHash)return NextResponse.json({error:"PDT_BOBA_ZIP_UPLOAD_RECOVERY_002_EXACT_AUTHORIZATION_BINDING_REQUIRED"},{status:409});
  const exact=exactPdtBoba001B01ZipUploadRecovery002Body(authorizationId);
  if(hashOperationRequest(exact)!==authorizationRequestHash)return NextResponse.json({error:"PDT_BOBA_ZIP_UPLOAD_RECOVERY_002_AUTHORIZATION_REQUEST_HASH_MISMATCH"},{status:409});
  const writeToken=process.env.ETSY_B01_WRITE_TOKEN?.trim()??"";
  if(!writeToken)return NextResponse.json({error:"AUTHORIZED_ETSY_WRITE_TOKEN_NOT_CONFIGURED"},{status:503});
  const delegated=new Request(request.url,{method:"POST",headers:{"content-type":"application/json","x-autodigitalpublisher-write-token":writeToken}});
  return handlePdtBoba001B01ZipUploadRecovery002(exact,delegated);
}
