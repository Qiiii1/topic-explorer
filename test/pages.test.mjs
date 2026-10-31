import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {buildPages} from '../scripts/build-pages.mjs';

test('GitHub Pages：子目录资源可解析，发布包启用浏览器模型且不包含服务端或密钥文件',async()=>{
  const output=await mkdtemp(join(tmpdir(),'topic-pages-'));
  try{
    await buildPages(output);
    const html=await readFile(join(output,'index.html'),'utf8');
    assert.match(html,/<meta name="topic-runtime" content="static">/);
    assert.doesNotMatch(html,/127\.0\.0\.1/);
    const base='https://qiiii1.github.io/topic-explorer/';
    for(const [,asset] of html.matchAll(/(?:src|href)="([^"]+)"/g)){
      const url=new URL(asset,base);
      assert.ok(url.pathname.startsWith('/topic-explorer/'));
      await readFile(resolve(output,url.pathname.slice('/topic-explorer/'.length)));
    }
    const files=await readdir(output,{recursive:true});
    assert.ok(files.includes('inspiration.js')&&files.includes('inspiration-rules.js'));
    assert.ok(files.includes('browser-model.js')&&files.includes('model-protocol.js')&&files.includes('.nojekyll'));
    assert.ok(files.every(file=>!/(?:^|\/)\.env|server\.mjs|test\/|reference\//.test(file)));
    assert.doesNotMatch(await readFile(new URL('../app/index.html',import.meta.url),'utf8'),/topic-runtime/);
  }finally{await rm(output,{recursive:true,force:true});}
});
