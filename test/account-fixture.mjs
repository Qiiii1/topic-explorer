export const accountEnv={SUPABASE_URL:'https://auth.example',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',SUPABASE_SECRET_KEY:'sb_secret_test'};
export const testUser={id:'10000000-0000-4000-8000-000000000001',email:'test@example.com',email_confirmed_at:'2026-11-01T00:00:00Z'};
export const testToken='test-access-token-for-unit-tests';
export const quota={limit:30,used:0,pending:0,remaining:30,blocked:false};
export function accountFetcher(modelFetcher){return async(url,options={})=>{
  if(url===accountEnv.SUPABASE_URL+'/auth/v1/user')return Response.json(testUser);
  if(url.startsWith(accountEnv.SUPABASE_URL+'/rest/v1/rpc/')){
    const name=url.split('/').at(-1);
    return Response.json(name==='topic_account'?quota:{status:name==='topic_reserve'?'reserved':JSON.parse(options.body).p_success?'succeeded':'failed',quota});
  }
  return modelFetcher(url,options);
};}
export function authenticated(request){const headers=new Headers(request.headers);headers.set('Authorization','Bearer '+testToken);headers.set('Idempotency-Key',crypto.randomUUID());return new Request(request,{headers});}
