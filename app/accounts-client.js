import {AuthClient} from './vendor/supabase/auth.js';

export function authMessage(error){
  const messages={
    invalid_credentials:'邮箱或密码不正确。',email_not_confirmed:'请先验证邮箱，再登录。',
    user_already_exists:'这个邮箱已注册，请登录。',weak_password:'请使用至少 8 位的密码。',
    same_password:'新密码需要与原密码不同。',over_email_send_rate_limit:'邮件发送过于频繁，请稍后重试。',
    over_request_rate_limit:'操作过于频繁，请稍后重试。',signup_disabled:'注册暂未开放。',
    email_address_invalid:'请输入有效的邮箱地址。',email_address_not_authorized:'验证邮件暂时无法发送，请稍后再试。',
    otp_expired:'邮件链接已过期，请重新发送。',bad_code_verifier:'请在发起操作的浏览器打开邮件链接。',
    flow_state_not_found:'邮件链接已失效，请重新发送。',flow_state_expired:'邮件链接已过期，请重新发送。',
    session_not_found:'登录已过期，请重新登录。',reauthentication_needed:'请重新登录后再修改密码。',
  };
  return messages[error?.code]||(error?.name==='AuthRetryableFetchError'?'账号服务暂时无法连接，请重试。':'操作未完成，请稍后重试。');
}
export async function createAccountClient({api,onChange,onError,location=window.location}){
  const config=await api('/auth/config');
  const redirectTo=new URL(location.pathname,location.origin).href;
  const client=new AuthClient({url:config.url+'/auth/v1',headers:{apikey:config.publishableKey},storageKey:'topic-explorer-auth-v1',autoRefreshToken:true,persistSession:true,detectSessionInUrl:true,flowType:'pkce'});
  // Avoid running Auth methods while the SDK's auth-state lock is held.
  client.onAuthStateChange((event,session)=>{setTimeout(()=>onChange({event,session}),0);});
  const {error}=await client.initialize();if(error)onError(authMessage(error));
  const checked=async promise=>{const result=await promise;if(result.error)throw new Error(authMessage(result.error));return result.data;};
  return {
    async credential(){const data=await checked(client.getSession());return data.session?{token:data.session.access_token,userId:data.session.user.id}:null;},
    signIn:(email,password)=>checked(client.signInWithPassword({email,password})),
    signUp:(email,password)=>checked(client.signUp({email,password,options:{emailRedirectTo:redirectTo}})),
    recover:email=>checked(client.resetPasswordForEmail(email,{redirectTo})),
    resend:email=>checked(client.resend({type:'signup',email,options:{emailRedirectTo:redirectTo}})),
    updatePassword:password=>checked(client.updateUser({password})),
    async signOut(){await checked(client.signOut({scope:'local'}));},
  };
}
