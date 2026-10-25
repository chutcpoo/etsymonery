import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import C from '../config/n04-art-release.json';

type Row = Record<string, any>;
type Deps = { token:()=>Promise<string>; headers:(token:string)=>Record<string,string>; fetchImpl?:typeof fetch };
const API='https://api.etsy.com/v3/application';
function fail(s:string):never { throw new Error(s); }
const norm=(s:unknown)=>String(s??'').replace(/\r\n/g,'\n').normalize('NFC').trim();
export function safeEqual(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)}
export function auth(request:Request,secret:string|undefined,now=Date.now()){
  if(!secret||secret.length<32)fail('N04_OPERATOR_NOT_CONFIGURED');
  if(now>Date.parse(C.expiresAt))fail('N04_AUTHORIZATION_EXPIRED');
  if(!safeEqual(request.headers.get('x-n04-operator')??'',secret))fail('N04_OPERATOR_REQUIRED');
}
export function categoryMatches(nodes:Row[],ancestors:string[]=[]):Row[]{
  return nodes.flatMap(n=>{const path=[...ancestors,norm(n.name)];return [ ...(path.join(' > ')===C.taxonomyPath.join(' > ')?[{id:Number(n.id),path}]:[]),...categoryMatches(n.children??[],path)]});
}
export function validateListing(l:Row,id:number,taxonomy:number){
  const price=l.price??{};
  if(Number(l.listing_id)!==id||Number(l.shop_id)!==C.shopId||norm(l.title)!==C.title||norm(l.description)!==C.description||
    Number(l.taxonomy_id)!==taxonomy||price.currency_code!==C.currency||Number(price.amount)/Number(price.divisor)!==C.price||
    l.who_made!==C.whoMade||l.when_made!==C.whenMade||(l.listing_type??l.type)!=='download'||
    JSON.stringify([...(l.tags??[])].sort())!==JSON.stringify([...C.tags].sort()))fail('N04_LISTING_IDENTITY_MISMATCH');
  if(!['draft','active'].includes(l.state))fail('N04_STATE_NOT_SUPPORTED');
}
export function assetFor(name:string,bytes:Uint8Array){
  const a=C.assets.find(a=>a.name===name);if(!a)fail('N04_ASSET_NOT_APPROVED');
  if(bytes.byteLength!==a.bytes||createHash('sha256').update(bytes).digest('hex')!==a.sha256)fail('N04_ASSET_HASH_MISMATCH');
  return a;
}
function sign(row:Row,secret:string){return createHmac('sha256',secret).update(JSON.stringify(row)).digest('hex')}
export function validateReceipts(receipts:Row[],listingId:number,secret:string){
  if(!Array.isArray(receipts)||receipts.length!==C.assets.length)fail('N04_ALL_ASSET_RECEIPTS_REQUIRED');
  const seen=new Set<string>();
  for(const r of receipts){
    const {signature,...payload}=r;const a=C.assets.find(x=>x.name===r.name);
    if(!a||seen.has(r.name)||payload.listingId!==listingId||payload.sha256!==a.sha256||payload.kind!==a.kind||
      payload.rank!==a.rank||!Number.isSafeInteger(payload.resourceId)||payload.resourceId<1||
      typeof signature!=='string'||!safeEqual(signature,sign(payload,secret)))fail('N04_RECEIPT_INVALID');
    seen.add(r.name);
  }
}
export async function handleN04(request:Request,deps:Deps){
  const fetcher=deps.fetchImpl??fetch;
  let writes=0;
  const reply=(o:Row,status=200)=>Response.json({...o,ETSY_WRITE_COUNT:writes},{status,headers:{'cache-control':'no-store'}});
  try{
    const isGet=request.method==='GET';const secret=process.env.N04_ART_RELEASE_OPERATOR_TOKEN;
    if(!isGet)auth(request,secret);
    const token=await deps.token();const headers=deps.headers(token);
    async function api(path:string,method='GET',body?:BodyInit,multipart=false){
      const h={...headers};if(multipart)delete h['content-type'];else if(method!=='GET')h['content-type']='application/x-www-form-urlencoded';
      let response:Response;try{response=await fetcher(API+path,{method,headers:h,body,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(45000)})}catch{fail(method==='GET'?'ETSY_READ_FAILED':'ETSY_WRITE_AMBIGUOUS_RECONCILE_BEFORE_RETRY')}
      if(method!=='GET')writes++;
      const data=await response.json().catch(()=>({}));
      if(!response.ok){const msg=norm(data.error??data.error_description??data.message);fail(`ETSY_HTTP_${response.status}`+(/token|key|secret/i.test(msg)?'':':'+msg.slice(0,180)))}
      return data as Row;
    }
    const shop=await api(`/shops/${C.shopId}`);
    if(Number(shop.shop_id)!==C.shopId||shop.shop_name!==C.shopName||shop.currency_code!==C.currency)fail('N04_SHOP_OR_CURRENCY_MISMATCH');
    const taxonomy=await api('/seller-taxonomy/nodes');const categories=categoryMatches(taxonomy.results??[]);
    if(categories.length!==1)return reply({status:'CATEGORY_REVIEW_REQUIRED',coloringCandidates:JSON.stringify(taxonomy).includes('Coloring Books')},409);
    const cat=categories[0];
    if(isGet)return reply({status:'PREFLIGHT_READY',shopId:C.shopId,shopName:C.shopName,currency:C.currency,category:cat,title:C.title,price:C.price,assetCount:C.assets.length,releaseEvidenceSha256:C.releaseEvidenceSha256,authorization:C.authorization,commit:process.env.VERCEL_GIT_COMMIT_SHA});
    const multipart=request.headers.get('content-type')?.includes('multipart/form-data');
    const form=multipart?await request.formData():null;
    const input:Row=form?Object.fromEntries(form.entries()):await request.json();
    if(input.authorization!==C.authorization)fail('N04_EXACT_AUTHORIZATION_REQUIRED');
    if(input.action==='CREATE_DRAFT'){
      const found:Row[]=[];
      for(const state of ['draft','active','inactive','expired','sold_out']){
        const page=await api(`/shops/${C.shopId}/listings?state=${state}&limit=100`);
        if(Number(page.count)>100||!Array.isArray(page.results))fail('N04_SHOP_SCAN_INCOMPLETE');
        found.push(...page.results.filter((r:Row)=>norm(r.title).toLowerCase()===C.title.toLowerCase()));
      }
      if(found.length){
        if(found.length!==1)fail('N04_MULTIPLE_MATCHES');
        const l=await api(`/listings/${found[0].listing_id}`);validateListing(l,Number(l.listing_id),cat.id);
        return reply({status:'EXISTING_EXACT_LISTING',listingId:l.listing_id,state:l.state,category:cat});
      }
      const body=new URLSearchParams({title:C.title,description:C.description,price:C.price.toFixed(2),quantity:String(C.quantity),taxonomy_id:String(cat.id),who_made:C.whoMade,when_made:C.whenMade,type:'download',tags:C.tags.join(','),is_supply:'false',is_personalizable:'false',is_customizable:'false',should_auto_renew:'false'});
      const created=await api(`/shops/${C.shopId}/listings`,'POST',body);const id=Number(created.listing_id);
      if(!Number.isSafeInteger(id)||id<1)fail('N04_CREATE_RESULT_AMBIGUOUS');
      const l=await api(`/listings/${id}`);validateListing(l,id,cat.id);if(l.state!=='draft')fail('N04_DRAFT_STATE_MISMATCH');
      return reply({status:'DRAFT_CREATED_VERIFIED',listingId:id,state:l.state,category:cat});
    }
    const id=Number(input.listingId);if(!Number.isSafeInteger(id)||id<1)fail('N04_INVALID_LISTING_ID');
    const l=await api(`/listings/${id}`);validateListing(l,id,cat.id);
    const filesPath=`/shops/${C.shopId}/listings/${id}/files`;
    const files=await api(filesPath);const images=await api(`/listings/${id}/images`);const videos=await api(`/listings/${id}/videos`);
    if(![files,images,videos].every(x=>Array.isArray(x.results)))fail('N04_COLLECTION_READBACK_INVALID');
    if(input.action==='READBACK')return reply({status:'VERIFIED_IDENTITY',listingId:id,state:l.state,category:cat,price:l.price,files:files.results,images:images.results,videos:videos.results,url:l.url});
    if(input.action==='UPLOAD'){
      if(l.state!=='draft')fail('N04_UPLOAD_DRAFT_ONLY');
      const file=input.assetFile;if(!(file instanceof File))fail('N04_BINARY_REQUIRED');
      const bytes=new Uint8Array(await file.arrayBuffer());const a=assetFor(String(input.assetName),bytes);
      const rows=a.kind==='file'?files.results:a.kind==='image'?images.results:videos.results;
      if(a.kind==='file'&&rows.some((r:Row)=>r.filename===a.name))fail('N04_FILE_ALREADY_EXISTS_RECONCILE');
      if(a.kind==='image'&&rows.some((r:Row)=>Number(r.rank)===a.rank))fail('N04_IMAGE_RANK_ALREADY_EXISTS_RECONCILE');
      if(a.kind==='video'&&rows.length)fail('N04_VIDEO_ALREADY_EXISTS_RECONCILE');
      const upload=new FormData();upload.append(a.kind==='image'?'image':a.kind==='video'?'video':'file',file,a.name);
      upload.append('name',a.name);if(a.kind!=='video')upload.append('rank',String(a.rank));if(a.kind==='image')upload.append('alt_text',a.alt);
      const path=`/shops/${C.shopId}/listings/${id}/${a.kind==='file'?'files':a.kind==='image'?'images':'videos'}`;
      const receipt=await api(path,'POST',upload,true);const resourceId=Number(receipt[a.kind==='file'?'listing_file_id':a.kind==='image'?'listing_image_id':'video_id']);
      if(!Number.isSafeInteger(resourceId)||resourceId<1)fail('N04_UPLOAD_RECEIPT_AMBIGUOUS');
      const payload={listingId:id,name:a.name,kind:a.kind,rank:a.rank,sha256:a.sha256,resourceId};
      return reply({status:'ASSET_UPLOADED_HASH_VERIFIED',receipt:{...payload,signature:sign(payload,secret!)}});
    }
    if(input.action!=='PUBLISH')fail('N04_ACTION_NOT_ALLOWED');
    validateReceipts(input.receipts,id,secret!);
    if(files.results.length!==4||images.results.length!==10||videos.results.length!==1)fail('N04_ASSET_COUNTS_MISMATCH');
    for(const r of input.receipts){
      const a=C.assets.find(x=>x.name===r.name)!;
      const row=(r.kind==='file'?files.results:r.kind==='image'?images.results:videos.results).find((x:Row)=>Number(x[r.kind==='file'?'listing_file_id':r.kind==='image'?'listing_image_id':'video_id'])===r.resourceId);
      if(!row)fail('N04_ASSET_ID_NOT_READ_BACK');
      if(a.kind==='file'&&(row.filename!==a.name||Number(row.size_bytes)!==a.bytes))fail('N04_BUYER_FILE_READBACK_MISMATCH');
      if(a.kind==='image'&&(Number(row.rank)!==a.rank||norm(row.alt_text)!==a.alt))fail('N04_IMAGE_READBACK_MISMATCH');
      if(a.kind==='video'&&row.video_state!=='active')fail('N04_VIDEO_NOT_READY');
    }
    if(l.state==='active')return reply({status:'ALREADY_PUBLISHED_VERIFIED',listingId:id,url:l.url,category:cat});
    await api(`/shops/${C.shopId}/listings/${id}`,'PATCH',new URLSearchParams({state:'active'}));
    const active=await api(`/listings/${id}`);validateListing(active,id,cat.id);if(active.state!=='active')fail('N04_PUBLISH_RESULT_NOT_ACTIVE');
    return reply({status:'PUBLISHED_VERIFIED',listingId:id,state:active.state,url:active.url,price:active.price,category:cat,files:4,images:10,videos:1});
  }catch(e){return reply({status:'STOPPED',error:e instanceof Error?e.message:'N04_UNKNOWN_ERROR',reconcileBeforeRetry:true},409)}
}
