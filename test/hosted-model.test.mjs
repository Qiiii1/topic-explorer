import test from 'node:test';
import assert from 'node:assert/strict';
import {handleRequest} from '../cloudflare/worker.js';
import {createModelRuntime} from '../app/model-runtime.js';
import {createProject,rootOf,appendGenerated} from '../app/domain.js';
import {inspirationInput} from '../app/inspiration.js';

const origin='https://qiiii1.github.io';
const env={TOPIC_AI_BASE_URL:'https://model.example/v1',TOPIC_AI_MODEL:'server-model',TOPIC_AI_API_KEY:'test-server-credential',TOPIC_WEB_ORIGINS:origin};
const card={title:'新的方向',description:'具体体验',rationale:'从来源继续细化'};
const input={operation:'expand',project:{title:'协作',context:'四周完成'},node:{id:'a',kind:'root',title:'多人协作'},targetKind:'pain',count:3,ancestors:[],exclude:[]};
function request(path,{method='GET',body,headers={},signal}={}){
  return new Request('https://api.example'+path,{method,headers:{Origin:origin,...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},body:body===undefined?undefined:JSON.stringify(body),signal});
}
const post=(body,path='/api/generate')=>request(path,{method:'POST',body});
const upstream=nodes=>Response.json({choices:[{message:{content:JSON.stringify({nodes})}}]});

test('托管 API：仅服务端持有凭据，网页不能读出、替换或清空配置',async()=>{
  let calls=0;
  const fetcher=async(url,options)=>{
    calls++;assert.equal(url,'https://model.example/v1/chat/completions');assert.equal(options.headers.Authorization,'Bearer '+env.TOPIC_AI_API_KEY);
    assert.equal(options.redirect,'error');const payload=JSON.parse(options.body);assert.equal(payload.model,'server-model');assert.match(payload.messages[1].content,/四周完成/);
    return upstream(Array.from({length:10},(_,i)=>({...card,title:card.title+i})));
  };
  const status=await handleRequest(request('/api/status'),env,{fetcher});
  assert.deepEqual(await status.json(),{managed:true,mode:'live',model:'server-model'});
  for(const path of ['/api/model','/api/models','/api/model/clear'])assert.equal((await handleRequest(post({apiKey:'attacker-key',baseUrl:'https://attacker.example',model:'attacker-model'},path),env,{fetcher})).status,403);
  for(const count of [3,6,10]){
    const result=await handleRequest(post({...input,count,model:'attacker-model',baseUrl:'https://attacker.example'}),env,{fetcher});
    assert.equal(result.status,200);assert.equal((await result.json()).nodes.length,count);
  }
  assert.equal(calls,3);
  assert.equal((await handleRequest(post({...input,count:4}),env,{fetcher})).status,400);assert.equal(calls,3);
  const missing=await handleRequest(post(input),{...env,TOPIC_AI_API_KEY:''},{fetcher});assert.equal(missing.status,503);assert.doesNotMatch(await missing.text(),/test-server-credential/);
});

test('托管 API：GitHub Pages 的跨域预检、错误和结果均携带精确来源，拒绝其他来源',async()=>{
  const preflight=await handleRequest(request('/api/generate',{method:'OPTIONS',headers:{'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}}),env);
  assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),origin);assert.match(preflight.headers.get('Access-Control-Allow-Headers'),/Content-Type/);assert.equal(preflight.headers.get('Access-Control-Allow-Credentials'),null);
  const bad=await handleRequest(request('/api/generate',{method:'POST',body:input,headers:{Origin:'https://other.example'}}),env,{fetcher:()=>assert.fail('来源不符不得调用模型')});
  assert.equal(bad.status,403);assert.equal(bad.headers.get('Access-Control-Allow-Origin'),null);
  for(const path of ['/api/status','/api/missing']){
    const response=await handleRequest(request(path),env);assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);assert.equal(response.headers.get('Cache-Control'),'no-store');
  }
  const response=await handleRequest(post(input),env,{fetcher:async()=>upstream([card])});assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
});

test('托管 API：错误脱敏、体积限制、非法 JSON 与取消均不泄露服务端凭据',async()=>{
  let calls=0;
  const options={fetcher:async()=>{calls++;return Response.json({error:{message:env.TOPIC_AI_API_KEY+' sk-private-value'}},{status:400});}};
  const response=await handleRequest(post(input),env,options);assert.equal(response.status,502);assert.doesNotMatch(await response.text(),/test-server-credential|sk-private-value/);
  const broken=await handleRequest(post({...input,project:{context:'x'.repeat(180001)}}),env,options);assert.equal(broken.status,400);
  const badJson=await handleRequest(new Request('https://api.example/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'}),env,options);assert.equal(badJson.status,400);assert.equal(calls,1);
  const network=await handleRequest(post(input),env,{fetcher:async()=>{throw new Error(env.TOPIC_AI_API_KEY);}});assert.equal(network.status,502);assert.doesNotMatch(await network.text(),/test-server-credential/);
  const controller=new AbortController();
  const cancelled=await handleRequest(request('/api/generate',{method:'POST',body:input,signal:controller.signal}),env,{fetcher:async()=>{controller.abort();return upstream([card]);}});assert.equal(cancelled.status,499);
});

test('托管 API：复用最新灵感协议，支持方向、方案和子方案，组合保留双来源',async()=>{
  const project=createProject('协作工具'),stages=[];
  for(let i=0;i<3;i++){
    const source=i?project.nodes.at(-1):rootOf(project),next=inspirationInput(project,source);stages.push(next.action);
    const response=await handleRequest(post(next),env,{fetcher:async(url,options)=>{
      assert.match(JSON.parse(options.body).messages[0].content,/有点意思/);
      return Response.json({choices:[{message:{content:JSON.stringify({action:next.action,append_to:source.id,nodes:[{type:next.targetKind,parent_id:source.id,title:'构想'+i,summary:'具体的构想',meta:{method:'remote-association',applicability_basis:'协作的共同机制',core:'共同判断',preserved:'保持共同判断',changed:'变化反馈时机'}}]})}}]});
    }});
    assert.equal(response.status,200);appendGenerated(project,source.id,next.targetKind,(await response.json()).nodes,'live');
  }
  assert.deepEqual(stages,['generate_directions','generate_ideas','evolve_idea']);
  const merged=await handleRequest(post({operation:'merge',nodes:[{id:'a',kind:'scene'},{id:'b',kind:'scene'}],ancestors:[]}),env,{fetcher:async()=>upstream([card])});assert.equal(merged.status,200);assert.equal((await merged.json()).nodes.length,1);
});

test('网页运行时：只请求托管 API，不接收模型密钥；配置缺失或网络失败不回退浏览器直连',async()=>{
  const calls=[],client=createModelRuntime({hosted:true,apiBase:'https://api.example',fetcher:async(url,options)=>{calls.push({url,options});return handleRequest(new Request(url,{...options,headers:{...options.headers,Origin:origin}}),env,{fetcher:async()=>upstream([card])});}});
  assert.equal((await client.request('/status')).managed,true);assert.equal((await client.request('/generate',input)).nodes.length,1);
  assert.equal(calls[1].url,'https://api.example/api/generate');assert.equal(calls[1].options.credentials,'omit');assert.doesNotMatch(JSON.stringify(calls),/test-server-credential|Authorization/);
  await assert.rejects(client.request('/model',{apiKey:'not-accepted'}),/站点管理/);assert.equal(calls.length,2);
  const missing=createModelRuntime({hosted:true,fetcher:()=>assert.fail('未配置不得发送请求')});assert.equal((await missing.request('/status')).mode,'unconfigured');await assert.rejects(missing.request('/generate',input),/暂未连接/);
  const offline=createModelRuntime({hosted:true,apiBase:'https://api.example',fetcher:async()=>{throw new Error('offline');}});await assert.rejects(offline.request('/status'),/暂时无法连接/);
});
