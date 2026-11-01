import {generationPayload,generationResult,normalizeConfig,providerError,validateGenerationInput} from '../app/model-protocol.js';

const MAX_BODY=180000;
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
  if(origin&&trusted){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Methods']='GET, POST, OPTIONS';headers['Access-Control-Allow-Headers']='Content-Type';}
  const send=(status,value)=>new Response(JSON.stringify(value),{status,headers});
  if(!url.pathname.startsWith('/api/'))return send(404,{error:'未找到操作'});
  if(!trusted)return send(403,{error:'请求来源不匹配'});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  const config=configuration(env);
  if(url.pathname==='/api/status'&&request.method==='GET')return send(200,{managed:true,mode:config?'live':'unconfigured',model:config?.model||''});
  if(['/api/model','/api/models','/api/model/clear'].includes(url.pathname))return send(403,{error:'模型服务由站点管理。'});
  if(url.pathname!=='/api/generate')return send(404,{error:'未找到操作'});
  if(request.method!=='POST')return send(405,{error:'不支持此操作'});
  let input;try{input=await readInput(request);}catch(error){return send(400,{error:error.message});}
  if(!config)return send(503,{error:'AI 服务暂未配置，请稍后再试。'});
  const timeout=AbortSignal.timeout(90000),signal=AbortSignal.any([request.signal,timeout]);
  let response;
  try{
    response=await fetcher(config.baseUrl+'/chat/completions',{
      method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:`Bearer ${config.apiKey}`},
      body:JSON.stringify(generationPayload(input,config)),signal,
    });
  }catch{
    return send(request.signal.aborted?499:timeout.aborted?504:502,{error:request.signal.aborted?'生成已取消。':timeout.aborted?'模型服务响应超时，可以重试。':'AI 服务连接失败，请稍后重试。'});
  }
  if(request.signal.aborted)return send(499,{error:'生成已取消。'});
  if(!response.ok)return send(response.status===429?429:502,{error:await providerError(response,config)});
  try{
    const result=await response.json(),content=result.choices?.[0]?.message?.content;
    if(typeof content!=='string')throw new Error();
    const generated=generationResult(content,input);
    if(request.signal.aborted)return send(499,{error:'生成已取消。'});
    return send(200,{mode:'live',...generated});
  }catch{return send(502,{error:'模型没有返回可用结果，可以重试；已有卡片已保留。'});}
}

export default {fetch:handleRequest};
