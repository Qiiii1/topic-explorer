import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserModelClient} from '../app/browser-model.js';

const input={operation:'expand',project:{title:'协作',context:'四周完成'},node:{id:'a',kind:'root',title:'多人协作'},targetKind:'pain',count:3,ancestors:[],exclude:[]};
const card={title:'讨论偏离初衷',description:'待验证的方向',rationale:'进一步聚焦协作中的讨论。'};
const connection={baseUrl:'https://api.deepseek.com/v1',provider:'deepseek',model:'deepseek-flash',apiKey:'page-only-secret'};

test('公开网页：真实模型协议、3/6/10 结果、不同页面的密钥隔离与清除',async()=>{
  const calls=[];
  const fetcher=async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/models'))return Response.json({data:[{id:'deepseek-flash'}]});
    return Response.json({choices:[{message:{content:JSON.stringify({nodes:Array.from({length:10},(_,i)=>({...card,title:card.title+i}))})}}]});
  };
  const client=createBrowserModelClient({fetcher}),other=createBrowserModelClient({fetcher});
  await assert.rejects(()=>client.request('/generate',input),/先连接/);
  await client.request('/model',connection);
  assert.equal((await client.request('/status')).verified,true);
  assert.doesNotMatch(JSON.stringify(await client.request('/status')),/page-only-secret|apiKey/);
  assert.equal((await other.request('/status')).hasKey,false);
  assert.equal((await createBrowserModelClient({fetcher}).request('/status')).hasKey,false);
  for(const count of [3,6,10]){
    const result=await client.request('/generate',{...input,count});
    assert.equal(result.nodes.length,count);assert.equal(result.mode,'live');
    const call=calls.at(-1),body=JSON.parse(call.options.body);
    assert.equal(call.url,'https://api.deepseek.com/v1/chat/completions');
    assert.equal(call.options.headers.Authorization,'Bearer page-only-secret');
    assert.equal(call.options.credentials,'omit');assert.equal(call.options.mode,'cors');
    assert.equal(call.options.referrerPolicy,'no-referrer');
    assert.equal(body.response_format.type,'json_object');assert.deepEqual(body.thinking,{type:'disabled'});
    assert.match(body.messages[1].content,/四周完成/);
  }
  const merge=await client.request('/generate',{operation:'merge',nodes:[{id:'a',kind:'pain'},{id:'b',kind:'pain'}],ancestors:[[{id:'root'}],[{id:'root'}]]});
  assert.equal(merge.nodes.length,1);
  await client.request('/model',{...connection,apiKey:''});
  await assert.rejects(()=>client.request('/model',{...connection,baseUrl:'https://other.example/v1',apiKey:''}),/API Key/);
  assert.equal((await client.request('/status')).baseUrl,connection.baseUrl);
  await client.request('/model/clear');
  await assert.rejects(()=>client.request('/generate',input),/先连接/);
});

test('公开网页：网络与服务错误不泄露密钥，取消后不接纳结果',async()=>{
  let behavior='network';
  const client=createBrowserModelClient({fetcher:async(_url,options)=>{
    if(behavior==='network')throw new TypeError('fetch failed page-only-secret');
    if(behavior==='provider')return Response.json({error:{message:'Bad parameter page-only-secret'}},{status:400});
    if(behavior==='parse')return new Response('<html>page-only-secret</html>');
    return new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true}));
  }});
  await client.request('/model',{...connection,baseUrl:'https://custom.example/v1',provider:'custom',model:'test-model'});
  await assert.rejects(()=>client.request('/generate',input),error=>/CORS/.test(error.message)&&!error.message.includes('page-only-secret'));
  behavior='provider';
  await assert.rejects(()=>client.request('/generate',input),error=>/Bad parameter/.test(error.message)&&!error.message.includes('page-only-secret'));
  behavior='parse';
  await assert.rejects(()=>client.request('/generate',input),error=>/无法读取/.test(error.message)&&!error.message.includes('page-only-secret'));
  behavior='cancel';const controller=new AbortController();
  const pending=client.request('/generate',input,controller.signal);controller.abort();
  await assert.rejects(pending,error=>error.name==='AbortError');
});
