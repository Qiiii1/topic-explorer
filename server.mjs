import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { demoGenerate } from './app/demo.js';
import {validateInspirationRequest} from './app/inspiration.js';
import { validateCandidates, normalizeConfig, providerError, generationPayload } from './app/model-protocol.js';
export { validateCandidates } from './app/model-protocol.js';

const directory=resolve(dirname(fileURLToPath(import.meta.url)),'app');
async function bodyOf(req){
  let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>180000)throw new Error('这次输入太长，请缩短项目背景。');}
  try{return JSON.parse(text||'{}');}catch{throw new Error('请求内容格式不正确');}
}
export function createPrototypeServer(initialConfig=null,{fetcher=fetch}={}){
 let config=initialConfig;
 const publicConfig=()=>({mode:config?'live':'demo',model:config?.model||'',baseUrl:config?.baseUrl||'',provider:config?.provider||'',hasKey:!!config?.apiKey,verified:!!config?.verified,models:config?.models||[]});
 async function availableModels(connection){
   const response=await fetcher(connection.baseUrl+'/models',{headers:{Authorization:`Bearer ${connection.apiKey}`},signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw new Error(await providerError(response,connection));
   const result=await response.json(),models=(result.data||[]).filter(v=>typeof v.id==='string').map(v=>({id:v.id,name:typeof v.name==='string'?v.name:v.id}));
   if(!models.length)throw new Error('服务没有返回可用模型，请检查 API 地址。');return models;
 }
 return http.createServer(async(req,res)=>{
  const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  try{
   const url=new URL(req.url,'http://localhost');
   if(url.pathname.startsWith('/api/')){
    const origin=req.headers.origin;
    if(origin&&origin!==`http://${req.headers.host}`)return send(403,{error:'请求来源不匹配'});
    if(req.headers['sec-fetch-site']==='cross-site')return send(403,{error:'请求来源不匹配'});
    if(req.method==='GET'&&url.pathname==='/api/status')return send(200,publicConfig());
    if(req.method!=='POST')return send(405,{error:'不支持此操作'});
    const input=await bodyOf(req);
    if(url.pathname==='/api/models'){
      const connection=normalizeConfig(input,config,true);return send(200,{models:await availableModels(connection)});
    }
    if(url.pathname==='/api/model'){
      const next=normalizeConfig(input,config);
      if(next.provider==='deepseek'){
        next.models=await availableModels(next);
        if(!next.models.some(v=>v.id===next.model))throw new Error('这个模型名称不在服务返回的列表中，请点击“读取可用模型”重新选择。');
        next.verified=true;
      }
      config=next;return send(200,publicConfig());
    }
    if(url.pathname==='/api/model/clear'){config=null;return send(200,{mode:'demo'});}
    if(url.pathname!=='/api/generate')return send(404,{error:'未找到操作'});
    if(!['expand','merge','inspire'].includes(input.operation))return send(400,{error:'请选择探索或关联操作'});
    if(input.operation==='inspire')validateInspirationRequest(input);
    if(input.operation==='expand'&&(!input.node||!['scene','pain','people'].includes(input.targetKind)||![3,6,10].includes(input.count)))return send(400,{error:'生成条件不完整'});
    if(input.operation==='merge'&&(!Array.isArray(input.nodes)||input.nodes.length!==2||input.nodes[0].id===input.nodes[1].id||input.nodes[0].kind!==input.nodes[1].kind||!['scene','pain','people'].includes(input.nodes[0].kind)))return send(400,{error:'只能关联两张不同的同类卡片'});
    if(!config){if(input.demo===true&&input.operation!=='inspire')return send(200,demoGenerate(input));return send(503,{error:'请先在模型设置中连接真实 AI 服务。示例项目只提供预置内容，不会代替真实生成。'});}
    const controller=new AbortController();res.on('close',()=>{if(!res.writableEnded)controller.abort();});
    const endpoint=config.baseUrl.endsWith('/chat/completions')?config.baseUrl:config.baseUrl+'/chat/completions';
    const payload=generationPayload(input,config);
    const upstream=await fetcher(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${config.apiKey}`},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(90000)]),body:JSON.stringify(payload)});
    if(!upstream.ok)throw new Error(await providerError(upstream,config));
    const result=await upstream.json();const content=result.choices?.[0]?.message?.content;
    if(typeof content!=='string')throw new Error('模型返回了空结果，可以调整模型后重试。');
    return send(200,{mode:'live',...validateCandidates(content,input.operation==='merge'?1:input.count,input.operation)});
   }
   if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);return res.end();}
   const requested=decodeURIComponent(url.pathname),file=resolve(directory,'.'+(requested==='/'?'/index.html':requested));
   if(file!==directory&&!file.startsWith(directory+sep)){res.writeHead(403);return res.end();}
   let data;try{data=await readFile(file);}catch{res.writeHead(404);return res.end('Not found');}
   const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.txt':'text/plain; charset=utf-8'}[extname(file)]||'application/octet-stream';
   res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(req.method==='HEAD'?undefined:data);
  }catch(error){if(res.destroyed)return;send(400,{error:error.name==='TimeoutError'?'模型服务响应超时，可以重试。':error.message==='fetch failed'?'无法连接模型服务，请检查接口地址与网络连接。':error.message||'操作没有完成，请重试。'});}
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const flag=process.argv.indexOf('--port');const port=Number(flag>=0?process.argv[flag+1]:process.env.PORT||4178);
 const config=process.env.TOPIC_AI_API_KEY&&process.env.TOPIC_AI_MODEL?normalizeConfig({baseUrl:process.env.TOPIC_AI_BASE_URL||'https://api.deepseek.com',model:process.env.TOPIC_AI_MODEL,apiKey:process.env.TOPIC_AI_API_KEY}):null;
 const server=createPrototypeServer(config);server.listen(port,'127.0.0.1',()=>console.log(`选题探索网页原型：http://127.0.0.1:${port}（${config?'已配置模型':'示例模式'}）`));
}
