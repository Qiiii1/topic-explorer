export class ApiError extends Error {
  constructor(status,code,message,extra={}){super(message);Object.assign(this,{status,code,...extra});}
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function accountConfig(env){
  try{
    const url=new URL(env.SUPABASE_URL);
    if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)return null;
    if(!env.SUPABASE_PUBLISHABLE_KEY||!env.SUPABASE_SECRET_KEY)return null;
    // Never expose a secret in the public auth configuration, even if misconfigured.
    const key=String(env.SUPABASE_PUBLISHABLE_KEY);
    if(!key.startsWith('sb_publishable_')){
      const claim=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
      if(claim.role!=='anon')return null;
    }
    return {url:url.origin,publishableKey:key,secret:env.SUPABASE_SECRET_KEY};
  }catch{return null;}
}
export function createAccounts(env,fetcher){
  const config=accountConfig(env);
  const ready=()=>{if(!config)throw new ApiError(503,'AUTH_UNAVAILABLE','账号服务暂未连接，请稍后再试。');};
  async function call(path,options){
    ready();let response;
    try{response=await fetcher(config.url+path,{...options,redirect:'manual',signal:AbortSignal.timeout(12000)});}
    catch{throw new ApiError(503,'ACCOUNT_UNAVAILABLE','账号服务暂时无法连接，请重试。');}
    return response;
  }
  async function identify(request){
    ready();const authorization=request.headers.get('Authorization')||'';
    if(!/^Bearer [^\s]{20,8192}$/.test(authorization))throw new ApiError(401,'LOGIN_REQUIRED','请先登录。');
    const response=await call('/auth/v1/user',{headers:{apikey:config.publishableKey,Authorization:authorization}});
    if([401,403].includes(response.status))throw new ApiError(401,'LOGIN_REQUIRED','登录已过期，请重新登录。');
    if(!response.ok)throw new ApiError(503,'ACCOUNT_UNAVAILABLE','账号服务暂时无法连接，请重试。');
    let user;try{user=await response.json();}catch{throw new ApiError(503,'ACCOUNT_UNAVAILABLE','账号状态暂时无法读取。');}
    if(!uuid.test(user.id)||!user.email||user.is_anonymous||!user.email_confirmed_at)throw new ApiError(403,'EMAIL_UNVERIFIED','请先完成邮箱验证，再登录。');
    return {id:user.id,email:user.email};
  }
  async function rpc(name,body){
    const headers={'Content-Type':'application/json',apikey:config?.secret};
    // New secret keys go in apikey only. Legacy service_role JWTs need Bearer too.
    if(config?.secret.startsWith('eyJ'))headers.Authorization='Bearer '+config.secret;
    const response=await call('/rest/v1/rpc/'+name,{method:'POST',headers,body:JSON.stringify(body)});
    if(!response.ok)throw new ApiError(503,'QUOTA_UNAVAILABLE','次数暂时无法确认，请稍后重试。');
    try{return await response.json();}catch{throw new ApiError(503,'QUOTA_UNAVAILABLE','次数暂时无法确认，请稍后重试。');}
  }
  return {config,identify,
    quota:user=>rpc('topic_account',{p_user_id:user.id}),
    async reserve(user,request,input){
      const id=request.headers.get('Idempotency-Key');
      if(!uuid.test(id||''))throw new ApiError(400,'REQUEST_ID_REQUIRED','请求标识无效，请刷新后重试。');
      const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(input)));
      const fingerprint=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join(''),lease=crypto.randomUUID();
      const result=await rpc('topic_reserve',{p_user_id:user.id,p_request_id:id,p_fingerprint:fingerprint,p_lease_id:lease});
      return {...result,id,fingerprint,lease};
    },
    finish:(user,reservation,success)=>rpc('topic_finish',{p_user_id:user.id,p_request_id:reservation.id,p_lease_id:reservation.lease,p_success:success}),
  };
}
