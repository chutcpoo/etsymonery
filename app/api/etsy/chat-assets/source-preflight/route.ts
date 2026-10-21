import { NextResponse } from "next/server";
import { createSourcePreflightPostHandler } from "../../../../../lib/etsy-chat-source-preflight";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
export async function GET(){
 return NextResponse.json({
   status:"READY_FOR_AUTHENTICATED_SOURCE_PREFLIGHT",
   mode:"READ_ONLY",requiresGoogleServiceAccount:false,
   operatorAuthConfigured:Boolean(process.env.ETSY_DRAFT_WRITE_TOKEN?.trim()),
   sourceRootConfigured:Boolean(process.env.GOOGLE_DRIVE_SOURCE_ROOT_ID?.trim()),
   draftWritePermitted:false,publishPermitted:false,ETSY_WRITE_COUNT:0
 },{headers:{"cache-control":"no-store"}});
}
export const POST=createSourcePreflightPostHandler();
