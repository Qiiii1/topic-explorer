// apiBase is public routing information, never a credential.
export function createModelRuntime({hosted=false,apiBase='',fetcher=fetch,credential=async()=>null,storage=globalThis.sessionStorage}={}){
  const retries=new Map();
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
    const headers=input===undefined?{}:{'Content-Type':'application/json'},body=input===undefined?undefined:JSON.stringify(input);
    let retryKey='';
    if(hosted&&['/generate','/account'].includes(path)){
      const identity=await credential();
      if(!identity?.token)throw Object.assign(new Error('请先登录。'),{status:401,code:'LOGIN_REQUIRED'});
      headers.Authorization='Bearer '+identity.token;
      if(path==='/generate'){
        const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body));
        retryKey='topic-request:'+identity.userId+':'+Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
        let entry=retries.get(retryKey);if(!entry)try{entry=JSON.parse(storage?.getItem(retryKey)||'null');}catch{/* Storage may be disabled. */}
        if(!entry||Date.now()-entry.created>86400000)entry={id:crypto.randomUUID(),created:Date.now()};
        if(retries.size>=100)retries.delete(retries.keys().next().value);retries.set(retryKey,entry);
        headers['Idempotency-Key']=entry.id;
        try{storage?.setItem(retryKey,JSON.stringify(entry));}catch{/* In-memory pending state still prevents double clicks. */}
      }
    }
    let response;
    try{response=await fetcher(base+'/api'+path,{method:input===undefined?'GET':'POST',credentials:hosted?'omit':'same-origin',cache:'no-store',referrerPolicy:'no-referrer',headers,body,signal});}
    catch{if(signal?.aborted)throw new DOMException('生成已取消','AbortError');throw new Error('AI 服务暂时无法连接，请稍后重试。');}
    let value;try{value=await response.json();}catch{throw new Error('AI 服务返回了无法读取的结果，请稍后重试。');}
    if(retryKey&&(response.ok||['REQUEST_COMPLETED','REQUEST_CONFLICT'].includes(value.code))){retries.delete(retryKey);try{storage?.removeItem(retryKey);}catch{}}
    if(!response.ok)throw Object.assign(new Error(value.error||'操作未完成，请重试'),{status:response.status,code:value.code,quota:value.quota});
    return value;
  }};
}
