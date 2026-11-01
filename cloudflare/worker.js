import {generationPayload,generationResult,normalizeConfig,providerError,validateGenerationInput} from '../app/model-protocol.js';

import {createAccounts,ApiError} from './accounts.js';

const MAX_BODY=180000;
// Best-effort short replay cache; durable quota records contain no prompts or cards.
const replays=new Map();
function replayKey(user,reservation){return user.id+':'+reservation.id+':'+reservation.fingerprint;}
function remember(key,result){
  for(const [id,value] of replays)if(value.expires<Date.now())replays.delete(id);
  if(replays.size>=100)replays.delete(replays.keys().next().value);
  replays.set(key,{result,expires:Date.now()+300000});
}
function configuration(env){
  try{return normalizeConfig({baseUrl:env.TOPIC_AI_BASE_URL||'https://api.deepseek.com',model:env.TOPIC_AI_MODEL,apiKey:env.TOPIC_AI_API_KEY});}
  catch{return null;}
}
async function readInput(request){
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new Error('请求需要使用 JSON 格式。');
  const reader=request.body?.getReader();if(!reader)throw new Error('请求内容为空。');
  const chunks=[];let size=0;
  try{
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BODY){await reader.cancel();throw new Error('这次输入太长，请缩短项目背景。');}chunks.push(value);}
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  let value;try{value=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new Error('请求内容格式不正确。');}
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('生成条件不完整。');
  validateGenerationInput(value);return value;
}

// Only this server module reads the model credential. Browsers cannot change it.
export async function handleRequest(request,env,{fetcher=fetch}={}){
  const url=new URL(request.url),origin=request.headers.get('origin');
  const allowed=new Set(String(env.TOPIC_WEB_ORIGINS||'').split(',').map(value=>value.trim()).filter(Boolean));
  const trusted=!origin||allowed.has(origin);
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
  if(origin&&trusted){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Methods']='GET, POST, OPTIONS';headers['Access-Control-Allow-Headers']='Content-Type, Authorization, Idempotency-Key';}
  const send=(status,value)=>new Response(JSON.stringify(value),{status,headers});
  if(!url.pathname.startsWith('/api/'))return send(404,{error:'未找到操作'});
  if(!trusted)return send(403,{error:'请求来源不匹配'});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  const config=configuration(env),accounts=createAccounts(env,fetcher);
  if(url.pathname==='/api/status'&&request.method==='GET')return send(200,{managed:true,mode:config?'live':'unconfigured',model:config?.model||'',authRequired:true,accountsReady:!!accounts.config});
  if(url.pathname==='/api/auth/config'&&request.method==='GET'){
    if(!accounts.config)return send(503,{code:'AUTH_UNAVAILABLE',error:'账号服务暂未连接，请稍后再试。'});
    return send(200,{url:accounts.config.url,publishableKey:accounts.config.publishableKey});
  }
  if(['/api/model','/api/models','/api/model/clear'].includes(url.pathname))return send(403,{error:'模型服务由站点管理。'});
  let user,reservation,candidate,finalized=false;
  try{
    if(url.pathname==='/api/account'&&request.method==='GET'){
      user=await accounts.identify(request);
      return send(200,{user,quota:await accounts.quota(user)});
    }
    if(url.pathname!=='/api/generate')return send(404,{error:'未找到操作'});
    if(request.method!=='POST')return send(405,{error:'不支持此操作'});
    user=await accounts.identify(request);
    let input;try{input=await readInput(request);}catch(error){throw new ApiError(400,'INVALID_INPUT',error.message);}
    if(!config)throw new ApiError(503,'MODEL_UNAVAILABLE','AI 服务暂未配置，请稍后再试。');
    reservation=await accounts.reserve(user,request,input);
    if(reservation.status==='completed'){
      const cached=replays.get(replayKey(user,reservation));
      if(cached?.expires>Date.now())return send(200,{...cached.result,quota:reservation.quota,replayed:true});
      throw new ApiError(409,'REQUEST_COMPLETED','这次生成已完成，未重复扣次。', {quota:reservation.quota});
    }
    const failures={
      pending:[409,'REQUEST_PENDING','这次生成正在进行，请稍后重试。'],
      conflict:[409,'REQUEST_CONFLICT','请求内容已变化，请重新生成。'],
      blocked:[403,'ACCOUNT_BLOCKED','账号暂不可用。'],
      exhausted:[429,'QUOTA_EXHAUSTED','30 次免费生成已用完。'],
      busy:[429,'ACCOUNT_BUSY','正在生成的请求较多，请稍后重试。'],
    };
    if(failures[reservation.status])throw new ApiError(...failures[reservation.status],{quota:reservation.quota});
    if(reservation.status!=='reserved')throw new ApiError(503,'QUOTA_UNAVAILABLE','次数暂时无法确认，请稍后重试。');
    const generated=await generateCards(request,input,config,fetcher);
    if(!generated.nodes?.length)throw new ApiError(422,'NO_RESULTS',generated.message||'没有生成可用卡片，本次未扣次数。');
    candidate=generated;
    const completion=await accounts.finish(user,reservation,true);
    if(completion.status!=='succeeded')throw new ApiError(409,'REQUEST_EXPIRED','这次生成已过期，请重新生成。');
    finalized=true;
    const result={mode:'live',...generated,quota:completion.quota};
    remember(replayKey(user,reservation),result);
    return send(200,result);
  }catch(error){
    let quota=error.quota;
    if(reservation?.status==='reserved'&&!finalized){
      try{
        const confirmed=await accounts.finish(user,reservation,false);quota=confirmed.quota;
        // The success commit may have arrived even if its HTTP response was lost.
        if(confirmed.status==='succeeded'&&candidate){
          const result={mode:'live',...candidate,quota};remember(replayKey(user,reservation),result);return send(200,result);
        }
      }catch{/* Expired leases release automatically. */}
    }
    return send(error.status||503,{error:error instanceof ApiError?error.message:'请求未完成，请稍后重试。',code:error.code||'SERVICE_UNAVAILABLE',...(quota?{quota}:{})});
  }
}

async function generateCards(request,input,config,fetcher){
  const timeout=AbortSignal.timeout(90000),signal=AbortSignal.any([request.signal,timeout]);
  let response;
  try{
    response=await fetcher(config.baseUrl+'/chat/completions',{
      method:'POST',redirect:'manual',headers:{'Content-Type':'application/json',Authorization:`Bearer ${config.apiKey}`},
      body:JSON.stringify(generationPayload(input,config)),signal,
    });
  }catch{
    throw new ApiError(request.signal.aborted?499:timeout.aborted?504:502,'MODEL_REQUEST_FAILED',request.signal.aborted?'生成已取消。':timeout.aborted?'模型服务响应超时，可以重试。':'AI 服务连接失败，请稍后重试。');
  }
  if(request.signal.aborted)throw new ApiError(499,'CANCELLED','生成已取消。');
  if(response.status>=300&&response.status<400)throw new ApiError(502,'MODEL_REDIRECT','模型服务地址发生跳转，请由站点检查配置。');
  if(!response.ok)throw new ApiError(response.status===429?429:502,'MODEL_ERROR',await providerError(response,config));
  try{
    const result=await response.json(),content=result.choices?.[0]?.message?.content;
    if(typeof content!=='string')throw new Error();
    const generated=generationResult(content,input);
    if(request.signal.aborted)throw new ApiError(499,'CANCELLED','生成已取消。');
    return generated;
  }catch(error){if(error instanceof ApiError)throw error;throw new ApiError(502,'INVALID_RESULT','模型没有返回可用结果，可以重试；已有卡片已保留。');}
}

export default {fetch:handleRequest};
