import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {EventEmitter} from 'node:events';
import {createPrototypeServer,validateCandidates} from '../server.mjs';
// Exercise the real request listener with Node streams, without opening TCP ports.
async function request(server,path,{method='GET',body,headers={}}={}){
  const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);
  Object.assign(req,{method,url:path,headers:{host:'127.0.0.1:4178',...Object.fromEntries(Object.entries(headers).map(([key,value])=>[key.toLowerCase(),value]))}});
  const res=new EventEmitter();Object.assign(res,{writableEnded:false,destroyed:false,statusCode:200});
  res.writeHead=(status,value)=>{res.statusCode=status;res.headers=value;return res;};
  res.end=value=>{res.body=value===undefined?Buffer.alloc(0):Buffer.from(value);res.writableEnded=true;return res;};
  await server.listeners('request')[0](req,res);
  return {status:res.statusCode,json:async()=>JSON.parse(res.body.toString()),text:async()=>res.body.toString()};
}
const input={operation:'expand',project:{title:'协作',context:'四周完成'},node:{id:'a',kind:'root',title:'多人协作'},targetKind:'pain',count:3,ancestors:[],exclude:[]};
const card={title:'讨论偏离初衷',description:'一个待验证的观察',rationale:'协作中的连续细节讨论可能掩盖原始目标。'};
test('模型输出必须包含标题和关联理由，允许说明无法合理组合',()=>{
  assert.throws(()=>validateCandidates('{"nodes":[{"title":"缺理由"}]}',3),/关联理由/);
  assert.equal(validateCandidates('```json\n'+JSON.stringify({nodes:[card]})+'\n```',3).nodes.length,1);
  assert.deepEqual(validateCandidates({canCombine:false,reason:'条件不相交'},1),{nodes:[],message:'条件不相交'});
});
test('本地服务：真实接口转发、密钥不外泄、未配置不会伪造生成、数量与来源校验',async()=>{
  let received,authorization;
  const api=createPrototypeServer(null,{fetcher:async(url,options)=>{received=JSON.parse(options.body);authorization=options.headers.Authorization;return Response.json({choices:[{message:{content:JSON.stringify({nodes:Array.from({length:10},(_,i)=>({...card,title:card.title+i}))})}}]});}});
    const post=(path,data,headers={})=>request(api,path,{method:'POST',headers,body:data});
    assert.equal((await post('/api/generate',input)).status,503);
    assert.equal((await post('/api/model',{baseUrl:'https://example.test/v1',model:'test-model',apiKey:'test-only-secret'})).status,200);
    const status=await(await request(api,'/api/status')).text();assert.doesNotMatch(status,/secret/);
    for(const count of [3,6,10]){
      const response=await post('/api/generate',{...input,count});assert.equal(response.status,200);
      const result=await response.json();assert.equal(result.mode,'live');assert.equal(result.nodes.length,count);
      assert.equal(received.model,'test-model');assert.match(received.messages[1].content,/四周完成/);assert.match(received.messages[1].content,new RegExp(`生成 ${count} 张`));
    }
    assert.equal(authorization,'Bearer test-only-secret');
    assert.equal((await post('/api/generate',{...input,count:4})).status,400);
    assert.equal((await post('/api/model/clear',{}, {Origin:'https://example.com'})).status,403);
    assert.equal((await post('/api/generate',{operation:'merge',nodes:[{id:'a',kind:'pain'},{id:'b',kind:'people'}]})).status,400);
    await post('/api/model/clear',{});assert.equal((await post('/api/generate',input)).status,503);
    for(const path of ['/','/app.js','/styles.css','/interactions.css','/assets/icons/figma-plus.svg'])assert.equal((await request(api,path)).status,200);
});
test('DeepSeek：拒绝 UUID、读取模型列表、校验配置并保留具体错误且隐藏密钥',async()=>{
  const calls=[];let generationFails=false;
  const fetcher=async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/models'))return Response.json({data:[{id:'deepseek-flash',name:'DeepSeek Flash'},{id:'deepseek-v4-pro'}]});
    if(generationFails)return Response.json({error:{message:'Unsupported parameter value; test-only-secret sk-private-secret'}},{status:400});
    return Response.json({choices:[{message:{content:JSON.stringify({nodes:[card]})}}]});
  };
  const api=createPrototypeServer(null,{fetcher});
    const post=(path,data)=>request(api,path,{method:'POST',body:data});
    const connection={baseUrl:'https://api.deepseek.com/v1/chat/completions/',apiKey:'test-only-secret',model:'00000000-1111-2222-3333-444444444444'};
    const invalid=await post('/api/model',connection);assert.equal(invalid.status,400);assert.match((await invalid.json()).error,/不是密钥或 UUID/);assert.equal(calls.length,0);
    const models=await(await post('/api/models',connection)).json();assert.equal(models.models[0].id,'deepseek-flash');assert.equal(calls[0].url,'https://api.deepseek.com/v1/models');
    assert.equal((await post('/api/model',{...connection,model:'deepseek-missing'})).status,400);
    assert.equal((await post('/api/model',{...connection,model:'deepseek-flash'})).status,200);
    const status=await(await request(api,'/api/status')).json();assert.equal(status.verified,true);assert.equal(status.hasKey,true);assert.doesNotMatch(JSON.stringify(status),/secret/);
    assert.equal((await post('/api/model',{...connection,model:'deepseek-v4-pro',apiKey:''})).status,200);
    assert.equal((await post('/api/generate',input)).status,200);const payload=JSON.parse(calls.at(-1).options.body);assert.deepEqual(payload.thinking,{type:'disabled'});assert.equal(payload.response_format.type,'json_object');assert.match(payload.messages[1].content,/"nodes"/);
    generationFails=true;const error=await(await post('/api/generate',input)).json();assert.match(error.error,/Unsupported parameter/);assert.doesNotMatch(error.error,/test-only-secret|sk-private-secret/);
});
