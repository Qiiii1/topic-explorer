import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {EventEmitter} from 'node:events';
import {createProject,rootOf,appendGenerated,switchExplorationMode,validateProject,favoriteNode,selectionExport,importSelection,getPaths,canCombine} from '../app/domain.js';
import {GenerationHistory} from '../app/generation-history.js';
import {inspirationInput,validateInspirationResult} from '../app/inspiration.js';
import {generationPayload,validateGenerationInput} from '../app/model-protocol.js';
import {createBrowserModelClient} from '../app/browser-model.js';
import {createPrototypeServer} from '../server.mjs';

const connection={baseUrl:'https://model.example/v1',model:'test-model',apiKey:'test-only-secret'};
function resultFor(input,suffix='') {
  return {action:input.action,append_to:input.selected_node_id,nodes:Array.from({length:input.count},(_,i)=>({type:input.targetKind,parent_id:input.selected_node_id,title:input.action+suffix+i,summary:'明确且有变化的新构想',meta:{method:input.targetKind==='direction'?'remote-association':null,applicability_basis:'原题中存在可迁移的协作机制',core:'保留协作中共同判断的关系',preserved:'让分歧可见',changed:'由即时反馈变为延时交换',assumptions:['反馈可能影响共同判断'],novelty_status:'unverified'}})),shortfall_reason:null};
}
function add(project,parent,suffix='') {
  const input=inspirationInput(project,parent),result=validateInspirationResult(resultFor(input,suffix),input);
  return appendGenerated(project,parent.id,input.targetKind,result.nodes,'live');
}
async function request(server,body) {
  const req=Readable.from([Buffer.from(JSON.stringify(body))]);Object.assign(req,{method:'POST',url:'/api/generate',headers:{host:'127.0.0.1:4178'}});
  const res=new EventEmitter();Object.assign(res,{writableEnded:false,destroyed:false,statusCode:200});
  res.writeHead=status=>{res.statusCode=status;return res;};res.end=value=>{res.body=JSON.parse(value);res.writableEnded=true;};
  await server.listeners('request')[0](req,res);return {status:res.statusCode,...res.body};
}

test('模式切换仅保留完整题目与条件，清除跨模式分支、连线和收藏；旧模式数据兼容',()=>{
  const project=createProject('完整题目'.repeat(40));project.context='明确要求：四周完成';
  const root=rootOf(project),original=root.description;
  const scene=appendGenerated(project,root.id,'scene',[{title:'旧场景',rationale:'来源'}])[0];favoriteNode(project,scene.id);root.hidden=true;
  assert.equal(switchExplorationMode(project,'inspiration'),true);
  assert.equal(project.nodes.length,1);assert.equal(rootOf(project).id,root.id);assert.equal(rootOf(project).description,original);assert.equal(rootOf(project).hidden,false);
  assert.equal(project.context,'明确要求：四周完成');assert.deepEqual(project.edges,[]);assert.deepEqual(project.favorites,[]);
  const dirs=add(project,rootOf(project));assert.equal(switchExplorationMode(project,'inspiration'),false);assert.equal(project.nodes.length,4);
  switchExplorationMode(project,'organize');assert.equal(project.nodes.length,1);assert.equal(rootOf(project).description,original);
  const legacy=createProject('旧项目');appendGenerated(legacy,rootOf(legacy).id,'pain',[{title:'旧痛点',rationale:'来源'}]);legacy.explorationMode='inspiration';assert.equal(validateProject(legacy).explorationMode,'organize');
});

test('方向生成、同方向追加并列方案、方案多层演进，完整原题和所有历史持续传回',()=>{
  const p=createProject('作业：为团队设计新的协作体验。硬约束：不能使用屏幕。');p.context='四周内完成';switchExplorationMode(p,'inspiration');
  const root=rootOf(p),input=inspirationInput(p,root);assert.equal(input.count,3);assert.equal(input.action,'generate_directions');
  const direction=add(p,root)[0],idea=add(p,direction)[0],parallel=add(p,direction,'another')[0];
  assert.deepEqual(idea.parentIds,[direction.id]);assert.deepEqual(parallel.parentIds,[direction.id]);
  const child=add(p,idea)[0],grandchild=add(p,child,'deep')[0];
  assert.deepEqual(getPaths(p,grandchild.id)[0].map(n=>n.id),[root.id,direction.id,idea.id,child.id,grandchild.id]);
  const next=inspirationInput(p,grandchild);assert.equal(next.action,'evolve_idea');assert.equal(next.count,1);assert.equal(next.brief.original,root.description);assert.equal(next.brief.explicit_requirements,p.context);assert.ok(next.nodes.some(n=>n.id===parallel.id));assert.equal(next.ancestors.length,5);
  assert.equal(child.meta.preserved,'让分歧可见');assert.equal(child.meta.changed,'由即时反馈变为延时交换');assert.equal(child.meta.method,null);
  assert.equal(p.edges.find(e=>e.to===child.id).relation,'演进方案');assert.equal(canCombine(idea,parallel),false);
});

test('灵感 JSON、选区、收藏及生成撤销均保留阶段和元数据',()=>{
  const p=createProject('完整原题');switchExplorationMode(p,'inspiration');const d=add(p,rootOf(p))[0],idea=add(p,d)[0];favoriteNode(p,idea.id);
  const restored=validateProject(JSON.parse(JSON.stringify(p)));assert.deepEqual(restored.nodes.at(-1).meta,idea.meta);assert.equal(restored.explorationMode,'inspiration');
  const selected=importSelection(selectionExport(p,[d.id,idea.id]));assert.equal(selected.explorationMode,'inspiration');assert.deepEqual(selected.nodes.find(n=>n.id===idea.id).meta,idea.meta);
  const h=new GenerationHistory();h.record([idea]);h.undo(p);h.redo(p);assert.deepEqual(p.nodes.find(n=>n.id===idea.id).meta,idea.meta);
});

test('三阶段提示遵循 skill，不要求三维度或完整实施方案，并携带历史与后台依据',()=>{
  const p=createProject('保留完整原题');switchExplorationMode(p,'inspiration');let node=rootOf(p);
  for(const action of ['generate_directions','generate_ideas','evolve_idea']) {
    const input=inspirationInput(p,node),payload=generationPayload(input,connection);
    assert.equal(input.action,action);assert.match(payload.messages[0].content,/远距离联想/);assert.match(payload.messages[0].content,/不能只加装饰/);assert.match(payload.messages[1].content,/保留完整原题/);assert.match(payload.messages[1].content,/shortfall_reason/);assert.match(payload.messages[1].content,/不要返回 sceneCategory/);assert.equal(payload.response_format.type,'json_object');
    node=add(p,node)[0];
  }
});

test('来源和阶段校验、方向证据、演进保留点、重复过滤及不足数量反馈',()=>{
  const p=createProject('原题');switchExplorationMode(p,'inspiration');const input=inspirationInput(p,rootOf(p));
  assert.throws(()=>validateGenerationInput({...input,action:'evolve_idea'}),/阶段/);assert.throws(()=>validateGenerationInput({...input,count:4}),/阶段/);
  assert.throws(()=>validateInspirationResult({...resultFor(input),append_to:'wrong'},input),/来源/);
  const missing=resultFor(input);missing.nodes[0].meta.applicability_basis=null;assert.throws(()=>validateInspirationResult(missing,input),/依据/);
  const dup=resultFor(input);dup.nodes[1].title=dup.nodes[0].title;const filtered=validateInspirationResult(dup,input);assert.equal(filtered.nodes.length,2);assert.ok(filtered.message);
  const direction=add(p,rootOf(p))[0],idea=add(p,direction)[0],evolve=inspirationInput(p,idea),bad=resultFor(evolve);bad.nodes[0].meta.changed=null;assert.throws(()=>validateInspirationResult(bad,evolve),/保留点/);
  p.inspirationCount=6;assert.equal(inspirationInput(p,idea).count,6);assert.equal(validateProject(p).inspirationCount,6);
});

test('本地服务与在线客户端完整支持所有灵感阶段，并在请求前拒绝阶段错配',async()=>{
  for(const runtime of ['local','browser']) {
    let calls=0;
    const fetcher=async(_url,options)=>{
      calls++;const payload=JSON.parse(options.body),text=payload.messages[1].content,input=JSON.parse(text.slice(text.indexOf('\n\n')+2));
      return Response.json({choices:[{message:{content:JSON.stringify(resultFor(input))}}]});
    };
    const server=createPrototypeServer(connection,{fetcher}),client=createBrowserModelClient({fetcher});await client.request('/model',connection);
    const run=input=>runtime==='local'?request(server,input):client.request('/generate',input);
    const p=createProject('不使用屏幕的协作体验');switchExplorationMode(p,'inspiration');let node=rootOf(p);
    for(const action of ['generate_directions','generate_ideas','evolve_idea']) {
      const input=inspirationInput(p,node);assert.equal(input.action,action);
      const result=await run(input);if(runtime==='local')assert.equal(result.status,200);assert.equal(result.mode,'live');assert.equal(result.nodes.length,input.count);
      node=appendGenerated(p,node.id,input.targetKind,result.nodes,'live')[0];
    }
    const bad={...inspirationInput(p,node),targetKind:'pain'};
    if(runtime==='local')assert.equal((await run(bad)).status,400);else await assert.rejects(()=>run(bad),/阶段/);
    assert.equal(calls,3);
  }
});

test('灵感生成取消后即使模型返回结果也不会接纳',async()=>{
  let release;
  const client=createBrowserModelClient({fetcher:async()=>new Promise(resolve=>{release=resolve;})});await client.request('/model',connection);
  const p=createProject('原题');switchExplorationMode(p,'inspiration');const input=inspirationInput(p,rootOf(p)),controller=new AbortController();
  const pending=client.request('/generate',input,controller.signal);controller.abort();switchExplorationMode(p,'organize');
  release(Response.json({choices:[{message:{content:JSON.stringify(resultFor(input))}}]}));
  await assert.rejects(()=>pending,error=>error.name==='AbortError');assert.equal(p.nodes.length,1);assert.equal(p.explorationMode,'organize');
});
