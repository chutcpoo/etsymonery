import { handleN04 } from '../../../../lib/n04-art-release';
import { getValidEtsyAccessToken } from '../../../../lib/etsy-auth';
import { etsyApiHeaders } from '../../../../lib/etsy';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=60;
const deps={token:()=>getValidEtsyAccessToken(['listings_r','listings_w']),headers:etsyApiHeaders};
export const GET=(request:Request)=>handleN04(request,deps);
export const POST=(request:Request)=>handleN04(request,deps);
