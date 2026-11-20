import test from 'node:test';
import assert from 'node:assert/strict';
import {createStaticServer} from '../server.mjs';

async function withServer(run){
  const server=createStaticServer();
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const base=`http://127.0.0.1:${server.address().port}`;
  try{await run(base);}finally{await new Promise(done=>server.close(done));}
}

test('本地打开：页面与模块可以直接访问，未知地址与目录外文件不会暴露',async()=>{
  await withServer(async base=>{
    const page=await fetch(base+'/');
    assert.equal(page.status,200);
    assert.match(page.headers.get('content-type'),/text\/html/);
    assert.match(await page.text(),/id="app"/);
    for(const path of ['/app.js','/styles.css','/interactions.css','/assets/icons/figma-plus.svg']){
      const response=await fetch(base+path);
      assert.equal(response.status,200,path);
    }
    assert.equal((await fetch(base+'/missing.js')).status,404);
    // 只能访问 app/ 目录，服务端文件与上级目录都取不到。
    assert.equal((await fetch(base+'/server.mjs')).status,404);
    for(const path of ['/%2e%2e/server.mjs','/..%2fserver.mjs','/../../package.json']){
      const response=await fetch(base+path);
      assert.ok([403,404].includes(response.status),`${path} -> ${response.status}`);
      assert.doesNotMatch(await response.text(),/createStaticServer/);
    }
    const post=await fetch(base+'/app.js',{method:'POST'});
    assert.equal(post.status,405);
    assert.equal(post.headers.get('allow'),'GET, HEAD');
    const head=await fetch(base+'/',{method:'HEAD'});
    assert.equal(head.status,200);
    assert.equal(await head.text(),'');
  });
});
