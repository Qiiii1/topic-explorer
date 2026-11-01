// apiBase is public routing information, never a credential.
export function createModelRuntime({hosted=false,apiBase='',fetcher=fetch}={}){
  let base='';
  if(apiBase){
    const url=new URL(apiBase);
    if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw new Error('AI 服务地址需要使用 HTTPS。');
    if(url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('AI 服务地址只能填写域名。');
    base=url.origin;
  }
  return {managed:hosted,async request(path,input,signal){
    if(signal?.aborted)throw new DOMException('生成已取消','AbortError');
    if(hosted&&!base){
      if(path==='/status')return {managed:true,mode:'unconfigured',model:''};
      throw new Error('AI 服务暂未连接，请稍后再试。');
    }
    if(hosted&&['/model','/models','/model/clear'].includes(path))throw new Error('模型服务由站点管理。');
    let response;
    try{response=await fetcher(base+'/api'+path,{method:input===undefined?'GET':'POST',credentials:hosted?'omit':'same-origin',cache:'no-store',referrerPolicy:'no-referrer',headers:input===undefined?{}:{'Content-Type':'application/json'},body:input===undefined?undefined:JSON.stringify(input),signal});}
    catch{if(signal?.aborted)throw new DOMException('生成已取消','AbortError');throw new Error('AI 服务暂时无法连接，请稍后重试。');}
    let value;try{value=await response.json();}catch{throw new Error('AI 服务返回了无法读取的结果，请稍后重试。');}
    if(!response.ok)throw new Error(value.error||'操作未完成，请重试');
    return value;
  }};
}
