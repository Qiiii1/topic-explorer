import {normalizeConfig,providerError,generationPayload,validateGenerationInput,generationResult} from './model-protocol.js';

// 模型接口由使用者自己配置：配置只保存在本机浏览器，不上传服务器，不写入项目文件。
// 选择“记住配置”时写入 localStorage，取消勾选或清除配置会立即删除这条记录。
export const STORAGE_KEY='topic-explorer-ai-config-v1';

function defaultStorage(){try{return globalThis.localStorage??null;}catch{return null;}}

export function createBrowserModelClient({fetcher=fetch,storage=defaultStorage()}={}){
  const read=()=>{
    try{
      const raw=storage?.getItem(STORAGE_KEY);
      if(!raw)return null;
      const value=JSON.parse(raw);
      if(typeof value?.baseUrl!=='string'||typeof value?.model!=='string'||typeof value?.apiKey!=='string'||!value.apiKey)return null;
      return {baseUrl:value.baseUrl,model:value.model,apiKey:value.apiKey,provider:value.provider==='deepseek'?'deepseek':'custom'};
    }catch{return null;}
  };
  const write=next=>{
    try{
      if(!storage)return;
      if(next)storage.setItem(STORAGE_KEY,JSON.stringify({baseUrl:next.baseUrl,model:next.model,apiKey:next.apiKey,provider:next.provider}));
      else storage.removeItem(STORAGE_KEY);
    }catch{}
  };
  let config=read();
  let remembered=!!config;
  // 密钥不会出现在返回值里，界面只拿得到“是否已配置”。
  const status=()=>({mode:config?'live':'unconfigured',model:config?.model||'',baseUrl:config?.baseUrl||'',provider:config?.provider||'',hasKey:!!config?.apiKey,verified:!!config?.verified,remembered,models:config?.models||[]});
  async function send(connection,path,{body,signal,timeout=15000}={}){
    const timeoutSignal=AbortSignal.timeout(timeout);
    const combined=signal?AbortSignal.any([signal,timeoutSignal]):timeoutSignal;
    let response;
    try{
      response=await fetcher(connection.baseUrl+path,{
        method:body===undefined?'GET':'POST',
        mode:'cors',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',cache:'no-store',
        headers:{Authorization:`Bearer ${connection.apiKey}`,...(body===undefined?{}:{'Content-Type':'application/json'})},
        body:body===undefined?undefined:JSON.stringify(body),signal:combined,
      });
    }catch(error){
      if(signal?.aborted)throw new DOMException('生成已取消','AbortError');
      if(timeoutSignal.aborted)throw new Error('模型服务响应超时，可以重试。');
      throw new Error('网页无法连接模型服务，请检查网络和 API 地址；其他兼容服务需要允许跨域访问（CORS）。');
    }
    if(!response.ok)throw new Error(await providerError(response,connection));
    try{return await response.json();}catch{
      if(signal?.aborted)throw new DOMException('生成已取消','AbortError');
      if(timeoutSignal.aborted)throw new Error('模型服务响应超时，可以重试。');
      throw new Error('模型服务返回了无法读取的内容，请检查 API 地址后重试。');
    }
  }
  async function models(connection,signal){
    const value=await send(connection,'/models',{signal});
    const list=(value.data||[]).filter(v=>typeof v.id==='string').map(v=>({id:v.id,name:typeof v.name==='string'?v.name:v.id}));
    if(!list.length)throw new Error('服务没有返回可用模型，请检查 API 地址。');
    return list;
  }
  return {async request(path,input,signal){
    if(signal?.aborted)throw new DOMException('生成已取消','AbortError');
    if(path==='/status')return status();
    if(path==='/model/clear'){config=null;remembered=false;write(null);return status();}
    if(path==='/models')return {models:await models(normalizeConfig(input,config,true),signal)};
    if(path==='/model'){
      const next=normalizeConfig(input,config);
      if(next.provider==='deepseek'){
        next.models=await models(next,signal);
        if(!next.models.some(v=>v.id===next.model))throw new Error('这个模型名称不在服务返回的列表中，请读取可用模型后重新选择。');
        next.verified=true;
      }
      config=next;
      const keep=input?.remember!==false;
      remembered=keep&&!!storage;
      write(keep?next:null);
      return status();
    }
    if(path!=='/generate')throw new Error('未找到操作');
    if(!config)throw new Error('请先在右上角配置 AI 接口，再生成卡片。');
    validateGenerationInput(input);
    const connection=config,result=await send(connection,'/chat/completions',{body:generationPayload(input,connection),signal,timeout:90000});
    if(signal?.aborted)throw new DOMException('生成已取消','AbortError');
    const content=result.choices?.[0]?.message?.content;
    if(typeof content!=='string')throw new Error('模型返回了空结果，可以调整模型后重试。');
    return {mode:'live',...generationResult(content,input)};
  }};
}
