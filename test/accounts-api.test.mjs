import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {handleRequest} from '../cloudflare/worker.js';
import {accountEnv,testToken} from './account-fixture.mjs';
import {createModelRuntime} from '../app/model-runtime.js';

let db;
before(async()=>{db=new PGlite();await db.exec('create schema auth; create table auth.users(id uuid primary key); create role anon; create role authenticated; create role service_role;');await db.exec(await readFile(new URL('../supabase/migrations/202611010001_accounts.sql',import.meta.url),'utf8'));});
after(async()=>{await db?.close();});
const env={...accountEnv,TOPIC_AI_BASE_URL:'https://model.example',TOPIC_AI_MODEL:'test-model',TOPIC_AI_API_KEY:'model-secret-only-server',TOPIC_WEB_ORIGINS:'https://qiiii1.github.io'};
const input={operation:'expand',project:{title:'钟'},node:{id:'root',kind:'root',title:'钟'},targetKind:'scene',ancestors:[],exclude:[],count:3};
const response=()=>Response.json({choices:[{message:{content:JSON.stringify({nodes:Array.from({length:10},(_,i)=>({title:'方向 '+i,description:'结合时间与环境变化',rationale:'从钟的功能继续展开'}))})}}]});
async function fixture(model=response){
  const user={id:crypto.randomUUID(),email:'unit@example.com',email_confirmed_at:'2026-11-01T00:00:00Z'};await db.query('insert into auth.users values ($1)',[user.id]);
  let modelCalls=0,lostCommit=false;
  const fetcher=async(url,options)=>{
    if(url===accountEnv.SUPABASE_URL+'/auth/v1/user')return options.headers.Authorization==='Bearer '+testToken?Response.json(user):Response.json({error:'invalid token'},{status:401});
    if(url.startsWith(accountEnv.SUPABASE_URL+'/rest/v1/rpc/')){
      assert.equal(options.headers.apikey,accountEnv.SUPABASE_SECRET_KEY);assert.equal(options.headers.Authorization,undefined);
      const name=url.split('/').at(-1),body=JSON.parse(options.body),args=Object.values(body);
      assert.equal(body.p_user_id,user.id);
      const data=(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as data`,args)).rows[0].data;
      if(lostCommit&&name==='topic_finish'&&body.p_success){lostCommit=false;throw new Error('response lost after commit');}
      return Response.json(data);
    }
    modelCalls++;return model(url,options);
  };
  const call=(path='/generate',{body=input,id=crypto.randomUUID(),token=testToken,signal}={})=>handleRequest(new Request('https://api.example/api'+path,{method:body===undefined||path!=='/generate'?'GET':'POST',headers:{Origin:'https://qiiii1.github.io','Content-Type':'application/json',Authorization:token?'Bearer '+token:'','Idempotency-Key':id},...(path==='/generate'?{body:JSON.stringify(body)}:{}),signal}),env,{fetcher});
  return {user,call,fetcher,get modelCalls(){return modelCalls;},loseCommitResponse(){lostCommit=true;}};
}
test('账号 API：拒绝匿名、伪造和未验证邮箱，公有配置不会泄露 Secret',async()=>{
  const f=await fixture();assert.equal((await f.call('/generate',{token:''})).status,401);assert.equal((await f.call('/generate',{token:'forged-but-long-enough-token'})).status,401);
  f.user.email_confirmed_at=null;assert.equal((await f.call()).status,403);assert.equal(f.modelCalls,0);
  const config=await f.call('/auth/config');assert.deepEqual(await config.json(),{url:accountEnv.SUPABASE_URL,publishableKey:accountEnv.SUPABASE_PUBLISHABLE_KEY});
  const bad=await handleRequest(new Request('https://api.example/api/auth/config'),{...env,SUPABASE_PUBLISHABLE_KEY:accountEnv.SUPABASE_SECRET_KEY});assert.equal(bad.status,503);assert.doesNotMatch(await bad.text(),/sb_secret|model-secret/);
});
test('完整 API + SQL：3/6/10 张各扣一次，同一标识重试返回结果且不重复生成扣次',async()=>{
  const f=await fixture();assert.equal((await (await f.call('/account')).json()).quota.remaining,30);
  for(const [i,count] of [3,6,10].entries()){
    const id=crypto.randomUUID(),body={...input,count};
    const result=await f.call('/generate',{id,body});assert.equal(result.status,200);const data=await result.json();assert.equal(data.nodes.length,count);assert.equal(data.quota.used,i+1);
    const repeat=await f.call('/generate',{id,body});assert.equal(repeat.status,200);const repeated=await repeat.json();assert.equal(repeated.replayed,true);assert.deepEqual(repeated.nodes,data.nodes);assert.equal(repeated.quota.used,i+1);
    assert.equal((await f.call('/generate',{id,body:{...input,count:count===3?6:3}})).status,409);
  }
  assert.equal(f.modelCalls,3);
});
test('完整 API + SQL：重复点击不发第二份模型请求，最后一次额度只分配一次',async()=>{
  let release,started;const waiting=new Promise(resolve=>{started=resolve;});const held=new Promise(resolve=>{release=resolve;});
  const f=await fixture(async()=>{started();await held;return response();});await f.call('/account');await db.query('update public.topic_accounts set used=29 where user_id=$1',[f.user.id]);
  const id=crypto.randomUUID(),first=f.call('/generate',{id});await waiting;
  const duplicate=await f.call('/generate',{id});assert.equal((await duplicate.json()).code,'REQUEST_PENDING');
  const extra=await f.call();assert.equal((await extra.json()).code,'QUOTA_EXHAUSTED');assert.equal(f.modelCalls,1);
  release();assert.equal((await (await first).json()).quota.used,30);
  assert.equal((await (await f.call()).json()).code,'QUOTA_EXHAUSTED');
});
test('完整 API + SQL：上游错误、非法结果、取消、空交集均不扣次，失败可复用标识重试',async()=>{
  for(const model of [()=>Response.json({error:'no'},{status:500}),()=>Response.json({choices:[]}),()=>new Response(null,{status:302,headers:{location:'https://other.example'}})]){
    const f=await fixture(model);assert.equal((await f.call()).status,502);const data=await (await f.call('/account')).json();assert.equal(data.quota.used,0);assert.equal(data.quota.remaining,30);
  }
  const control=new AbortController(),cancel=await fixture(()=>{control.abort();return response();});assert.equal((await cancel.call('/generate',{signal:control.signal})).status,499);assert.equal((await (await cancel.call('/account')).json()).quota.used,0);
  const empty=await fixture(()=>Response.json({choices:[{message:{content:'{"canCombine":false,"nodes":[],"message":"没有交集"}'}}]}));
  const result=await empty.call('/generate',{body:{operation:'merge',nodes:[{id:'a',kind:'scene'},{id:'b',kind:'scene'}],ancestors:[]}});assert.equal(result.status,422);assert.equal((await (await empty.call('/account')).json()).quota.used,0);
  let bad=true;const retry=await fixture(()=>bad?Response.json({error:'no'},{status:500}):response()),id=crypto.randomUUID();await retry.call('/generate',{id});bad=false;assert.equal((await (await retry.call('/generate',{id})).json()).quota.used,1);
});
test('完整 API + SQL：完成计数成功但响应丢失时确认原记录，仍交付结果且只扣一次',async()=>{
  const f=await fixture();f.loseCommitResponse();const result=await f.call();assert.equal(result.status,200);assert.equal((await result.json()).quota.used,1);assert.equal(f.modelCalls,1);
});
test('网页重试：网络失败沿用标识，成功后新生成使用新标识，账号之间隔离',async()=>{
  const ids=[];let fail=true,userId='user-a';
  const client=createModelRuntime({hosted:true,apiBase:'https://api.example',storage:null,credential:async()=>({token:testToken,userId}),fetcher:async(url,options)=>{ids.push(options.headers['Idempotency-Key']);if(fail)throw new Error('offline');return Response.json({nodes:[]});}});
  await assert.rejects(client.request('/generate',input));fail=false;await client.request('/generate',input);assert.equal(ids[0],ids[1]);await client.request('/generate',input);assert.notEqual(ids[1],ids[2]);
  fail=true;await assert.rejects(client.request('/generate',input));userId='user-b';await assert.rejects(client.request('/generate',input));assert.notEqual(ids[3],ids[4]);
});
