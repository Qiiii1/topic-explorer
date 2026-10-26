import {normalizeConfig,providerError,generationPayload,validateCandidates} from './model-protocol.js';

// One instance belongs to one open page. Credentials never enter storage or project data.
export function createBrowserModelClient({fetcher=fetch}={}){
  let config=null;
  const status=()=>({mode:config?'live':'unconfigured',model:config?.model||'',baseUrl:config?.baseUrl||'',provider:config?.provider||'',hasKey:!!config?.apiKey,verified:!!config?.verified,models:config?.models||[]});
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
    if(path==='/model/clear'){config=null;return status();}
    if(path==='/models')return {models:await models(normalizeConfig(input,config,true),signal)};
    if(path==='/model'){
      const next=normalizeConfig(input,config);
      if(next.provider==='deepseek'){
        next.models=await models(next,signal);
        if(!next.models.some(v=>v.id===next.model))throw new Error('这个模型名称不在服务返回的列表中，请读取可用模型后重新选择。');
        next.verified=true;
      }
      config=next;return status();
    }
    if(path!=='/generate')throw new Error('未找到操作');
    if(!config)throw new Error('请先连接你的 AI 服务，再生成卡片。');
    if(!['expand','merge'].includes(input.operation))throw new Error('请选择探索或关联操作');
    if(input.operation==='expand'&&(!input.node||!['scene','pain','people'].includes(input.targetKind)||![3,6,10].includes(input.count)))throw new Error('生成条件不完整');
    if(input.operation==='merge'&&(!Array.isArray(input.nodes)||input.nodes.length!==2||input.nodes[0].id===input.nodes[1].id||input.nodes[0].kind!==input.nodes[1].kind||!['scene','pain','people'].includes(input.nodes[0].kind)))throw new Error('只能关联两张不同的同类卡片');
    const connection=config,result=await send(connection,'/chat/completions',{body:generationPayload(input,connection),signal,timeout:90000});
    if(signal?.aborted)throw new DOMException('生成已取消','AbortError');
    const content=result.choices?.[0]?.message?.content;
    if(typeof content!=='string')throw new Error('模型返回了空结果，可以调整模型后重试。');
    return {mode:'live',...validateCandidates(content,input.operation==='merge'?1:input.count)};
  }};
}
