import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
let db;
before(async()=>{
  db=new PGlite();
  await db.exec('create schema auth; create table auth.users(id uuid primary key); create role anon; create role authenticated; create role service_role;');
  await db.exec(await readFile(new URL('../supabase/migrations/202611010001_accounts.sql',import.meta.url),'utf8'));
});
after(async()=>{await db?.close();});
async function user(){const id=crypto.randomUUID();await db.query('insert into auth.users values ($1)',[id]);return id;}
async function rpc(name,args){return (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args)).rows[0].result;}
const fingerprint='a'.repeat(64);
const reserve=(user,id=crypto.randomUUID(),hash=fingerprint,lease=crypto.randomUUID())=>rpc('topic_reserve',[user,id,hash,lease]);
const finish=(user,id,lease,success)=>rpc('topic_finish',[user,id,lease,success]);

test('SQL：每个账号一次性 30 次，预占防止超发，成功才扣，完成可重复确认',async()=>{
  const id=await user(),other=await user();
  assert.equal((await rpc('topic_account',[id])).remaining,30);
  for(let i=0;i<30;i++){
    const key=crypto.randomUUID(),lease=crypto.randomUUID();
    assert.equal((await reserve(id,key,fingerprint,lease)).status,'reserved');
    const result=await finish(id,key,lease,true);assert.equal(result.quota.used,i+1);assert.equal(result.quota.remaining,29-i);
    assert.equal((await finish(id,key,lease,true)).quota.used,i+1);
    assert.equal((await reserve(id,key)).status,'completed');
  }
  assert.equal((await reserve(id)).status,'exhausted');
  assert.equal((await rpc('topic_account',[other])).remaining,30);
});
test('SQL：失败、重复点击、不同输入重用标识、过期重试和迟到的完成相互隔离',async()=>{
  const id=await user(),key=crypto.randomUUID(),lease=crypto.randomUUID();
  const initial=await reserve(id,key,fingerprint,lease);assert.equal(initial.quota.remaining,29);assert.equal(initial.quota.used,0);
  assert.equal((await reserve(id,key)).status,'pending');
  assert.equal((await reserve(id,key,'b'.repeat(64))).status,'conflict');
  const fail=await finish(id,key,lease,false);assert.equal(fail.quota.remaining,30);assert.equal(fail.quota.used,0);
  const lease2=crypto.randomUUID();assert.equal((await reserve(id,key,fingerprint,lease2)).status,'reserved');
  assert.equal((await finish(id,key,lease,true)).status,'stale');
  await db.query("update public.topic_generation_requests set expires_at=now()-interval '1 second' where user_id=$1",[id]);
  assert.equal((await rpc('topic_account',[id])).remaining,30);
  const lease3=crypto.randomUUID();assert.equal((await reserve(id,key,fingerprint,lease3)).status,'reserved');
  assert.equal((await finish(id,key,lease2,false)).status,'stale');
  const success=await finish(id,key,lease3,true);assert.equal(success.quota.used,1);assert.equal(success.quota.remaining,29);
});
test('SQL：最后一次额度只分配给一份请求，禁用账号不能继续生成',async()=>{
  const id=await user();await rpc('topic_account',[id]);await db.query('update public.topic_accounts set used=29 where user_id=$1',[id]);
  const responses=await Promise.all(Array.from({length:6},()=>reserve(id)));
  assert.equal(responses.filter(v=>v.status==='reserved').length,1);assert.equal(responses.filter(v=>v.status==='exhausted').length,5);
  const other=await user();await rpc('topic_account',[other]);await db.query('update public.topic_accounts set blocked=true where user_id=$1',[other]);assert.equal((await reserve(other)).status,'blocked');
});
test('SQL：浏览器角色没有读取计数、篡改计数或调用服务端函数的权限',async()=>{
  const id=await user();await rpc('topic_account',[id]);
  for(const role of ['anon','authenticated']){
    await db.exec('set role '+role);
    try{
      await assert.rejects(db.query('select * from public.topic_accounts'),/permission denied/);
      await assert.rejects(rpc('topic_account',[id]),/permission denied/);
      await assert.rejects(reserve(id),/permission denied/);
      await assert.rejects(db.query('update public.topic_accounts set used=0'),/permission denied/);
    }finally{await db.exec('reset role');}
  }
  await db.exec('set role service_role');
  try{assert.equal((await rpc('topic_account',[id])).limit,30);}finally{await db.exec('reset role');}
});
