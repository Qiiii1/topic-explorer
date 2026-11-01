import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {buildPages} from '../scripts/build-pages.mjs';

test('GitHub Pages：子目录资源可解析，使用托管模型且不包含服务端或密钥文件',async()=>{
  const output=await mkdtemp(join(tmpdir(),'topic-pages-'));
  try{
    await buildPages(output,{apiBase:'https://topic-api.example'});
    const html=await readFile(join(output,'index.html'),'utf8');
    assert.match(html,/<meta name="topic-runtime" content="hosted">/);
    assert.match(html,/<meta name="topic-api-base" content="https:\/\/topic-api.example">/);
    assert.doesNotMatch(html,/127\.0\.0\.1/);
    const versions=[...html.matchAll(/(?:src|href)="[^"]+\.(?:css|js)\?v=([a-f0-9]{12})"/g)].map(match=>match[1]);
    assert.equal(versions.length,4);assert.equal(new Set(versions).size,1);
    const entry=await readFile(join(output,'app.js'),'utf8');
    assert.match(entry,new RegExp('domain\\.js\\?v='+versions[0]));
    const protocol=await readFile(join(output,'model-protocol.js'),'utf8');
    assert.match(protocol,new RegExp('inspiration\\.js\\?v='+versions[0]));

    const base='https://qiiii1.github.io/topic-explorer/';
    for(const [,asset] of html.matchAll(/(?:src|href)="([^"]+)"/g)){
      const url=new URL(asset,base);
      assert.ok(url.pathname.startsWith('/topic-explorer/'));
      await readFile(resolve(output,url.pathname.slice('/topic-explorer/'.length)));
    }
    const files=await readdir(output,{recursive:true});
    assert.ok(files.includes('inspiration.js')&&files.includes('inspiration-rules.js'));
    assert.ok(files.includes('model-runtime.js')&&files.includes('.nojekyll'));
    assert.ok(files.every(file=>!/(?:^|\/)\.env|server\.mjs|test\/|reference\/|cloudflare\/|wrangler/.test(file)));
    assert.doesNotMatch(await readFile(new URL('../app/index.html',import.meta.url),'utf8'),/topic-runtime/);
  }finally{await rm(output,{recursive:true,force:true});}
});

test('GitHub Pages：后端地址缺失时保持托管模式，拒绝带凭据或参数的构建地址',async()=>{
  const output=await mkdtemp(join(tmpdir(),'topic-hosted-'));
  try{
    await buildPages(output,{apiBase:''});const html=await readFile(join(output,'index.html'),'utf8');assert.match(html,/topic-runtime" content="hosted/);assert.match(html,/topic-api-base" content=""/);
    for(const apiBase of ['https://user:password@api.example','https://api.example/?key=secret','http://api.example','https://api.example/api'])await assert.rejects(buildPages(output,{apiBase}),/HTTPS 域名/);
  }finally{await rm(output,{recursive:true,force:true});}
});
