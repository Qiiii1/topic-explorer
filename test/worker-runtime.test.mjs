import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {build} from 'esbuild';

test('Cloudflare 真实运行时能发出模型请求，拒绝携带凭据跟随重定向',async()=>{
  const calls=[];let redirect=false;
  const bundled=await build({entryPoints:[fileURLToPath(new URL('../cloudflare/worker.js',import.meta.url))],bundle:true,write:false,format:'esm'});
  const worker=new Miniflare(convertV4MiniflareOptions({
    modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-10-30',
    bindings:{TOPIC_AI_BASE_URL:'https://model.example/v1',TOPIC_AI_MODEL:'test-model',TOPIC_AI_API_KEY:'runtime-only-test-key',TOPIC_WEB_ORIGINS:'https://qiiii1.github.io'},
    outboundService:async request=>{
      calls.push(request.url);assert.equal(request.url,'https://model.example/v1/chat/completions');
      assert.equal(request.headers.get('Authorization'),'Bearer runtime-only-test-key');
      const payload=await request.json();assert.equal(payload.model,'test-model');
      if(redirect)return new Response(null,{status:302,headers:{Location:'https://other.example/collect'}});
      return Response.json({choices:[{message:{content:JSON.stringify({nodes:[{title:'候选',description:'具体体验',rationale:'沿上层细化'}]})}}]});
    },
  }));
  const options={method:'POST',headers:{Origin:'https://qiiii1.github.io','Content-Type':'application/json'},body:JSON.stringify({operation:'expand',project:{title:'协作'},node:{id:'root',kind:'root',title:'协作'},targetKind:'scene',count:3,ancestors:[],exclude:[]})};
  try{
    const success=await worker.dispatchFetch('https://worker.example/api/generate',options);
    assert.equal(success.status,200);assert.equal((await success.json()).nodes[0].title,'候选');assert.equal(calls.length,1);
    redirect=true;const rejected=await worker.dispatchFetch('https://worker.example/api/generate',options);
    assert.equal(rejected.status,502);assert.match((await rejected.json()).error,/跳转/);assert.equal(calls.length,2);
    assert.ok(calls.every(url=>url.startsWith('https://model.example/')));
  }finally{await worker.dispose();}
});
