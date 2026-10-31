import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {EventEmitter} from 'node:events';
import {generationPayload,validateCandidates} from '../app/model-protocol.js';
import {validateInspirationRequest,canvasMode} from '../app/inspiration.js';
import {createBrowserModelClient} from '../app/browser-model.js';
import {createProject,rootOf,appendGenerated,validateProject,favoriteNode,selectionExport,importSelection,toMarkdown,clone,canCombine} from '../app/domain.js';
import {GenerationHistory} from '../app/generation-history.js';
import {editCard} from '../app/card-editing.js';
import {createPrototypeServer} from '../server.mjs';

const connection={baseUrl:'https://models.example.test/v1',provider:'custom',model:'test-inspiration',apiKey:'test-only-secret'};
const candidates=count=>Array.from({length:count},(_,index)=>({title:`时间装置 ${index}`,description:'通过具体的光影变化，让使用者感知一天的进程。',rationale:'保留时钟的时间表达，引入另一个领域的节律。',inspiration:{element:['鱼缸','地铁图','声音档案'][index%3]+index,mechanism:'时间进程与环境节律的关联',span:['near','cross','far'][index%3]}}));
const input={operation:'inspire',node:{id:'clock',kind:'root',title:'钟',description:'可以感知日常节律的钟'},project:{title:'探索钟',context:'混合概念与可落地体验'},count:3,ancestors:[],exclude:[{element:'植物',title:'植物钟'}]};

test('灵感协议区分发散与细化，传入当前编辑、来源、去重对象与混合跨度',()=>{
  const payload=generationPayload(input,{...connection,provider:'deepseek',model:'deepseek-flash'});
  assert.match(payload.messages[0].content,/跨界组合/);assert.match(payload.messages[1].content,/near.*cross.*far/);
  assert.match(payload.messages[1].content,/可以感知日常节律的钟/);assert.match(payload.messages[1].content,/植物钟/);
  assert.equal(payload.temperature,1);assert.deepEqual(payload.thinking,{type:'disabled'});
  assert.doesNotMatch(JSON.stringify(payload),/test-only-secret/);
  assert.throws(()=>validateInspirationRequest({...input,count:4}),/3、6 或 10/);
  assert.throws(()=>validateInspirationRequest({...input,node:{id:'a',title:' '}}),/选中/);
});

test('灵感响应保留组合机制，拒绝缺字段、重复元素、空体验与单一跨度',()=>{
  const valid=candidates(3);assert.deepEqual(validateCandidates(JSON.stringify({nodes:valid}),3,'inspire').nodes,valid);
  assert.throws(()=>validateCandidates({nodes:[{...valid[0],inspiration:undefined}]},3,'inspire'),/缺少组合元素/);
  assert.throws(()=>validateCandidates({nodes:valid.map(n=>({...n,inspiration:{...n.inspiration,element:'鱼缸'}}))},3,'inspire'),/重复/);
  assert.throws(()=>validateCandidates({nodes:valid.map(n=>({...n,inspiration:{...n.inspiration,span:'near'}}))},3,'inspire'),/跨度/);
  assert.throws(()=>validateCandidates({nodes:valid.map(n=>({...n,description:''}))},3,'inspire'),/具体体验/);
  assert.throws(()=>validateCandidates({nodes:valid.slice(0,1)},3,'inspire'),/跨度/);
});

test('灵感可接续细化、收藏、选区导入和生成撤回；模式切换与手动编辑保留',()=>{
  const project=createProject('钟'),root=rootOf(project),history=new GenerationHistory();
  assert.equal(canvasMode(project),'refine');project.canvasMode='inspiration';
  const ideas=appendGenerated(project,root.id,'inspiration',candidates(3),'live');history.record(ideas);
  const snapshot=favoriteNode(project,ideas[0].id),before=clone(snapshot);
  editCard(project,ideas[0].id,{title:'修改的创意',description:'修改后的交互',inspirationElement:'水纹',inspirationMechanism:'新的连接点',inspirationSpan:'far'});
  assert.equal(ideas[0].inspiration.element,'水纹');assert.deepEqual(snapshot,before);
  assert.equal(canCombine(ideas[0],ideas[1]),false);
  project.canvasMode='refine';
  const scene=appendGenerated(project,ideas[0].id,'scene',[{title:'晚间书桌',description:'回到家时看钟',rationale:'把这个灵感落到具体场景'}],'live')[0];
  history.record([scene]);history.undo(project);history.undo(project);
  assert.equal(project.canvasMode,'refine');assert.equal(project.nodes.length,1);assert.deepEqual(project.favorites[0],before);
  history.redo(project);history.redo(project);
  assert.equal(project.nodes.find(n=>n.id===ideas[0].id).inspiration.element,'水纹');
  assert.deepEqual(project.nodes.find(n=>n.id===scene.id).parentIds,[ideas[0].id]);
  const roundTrip=validateProject(JSON.parse(JSON.stringify(project)));assert.equal(roundTrip.canvasMode,'refine');
  const selection=selectionExport(project,ideas.map(n=>n.id)),imported=importSelection(selection);
  assert.equal(imported.nodes.filter(n=>n.kind==='inspiration').length,3);
  assert.match(toMarkdown(project),/组合元素：水纹/);assert.match(toMarkdown(project),/连接点：新的连接点/);
});

test('坏的灵感候选在改变布局或追加任何节点前被拒绝',()=>{
  const project=createProject('钟'),before=clone(project);
  assert.throws(()=>appendGenerated(project,rootOf(project).id,'inspiration',[...candidates(3),{title:'坏结果'}],'live'),/缺少组合/);
  assert.deepEqual(project,before);
});

test('浏览器模型端对 3/6/10 张灵感调用真实协议，非法输入不发送请求',async()=>{
  const calls=[];
  const client=createBrowserModelClient({fetcher:async(url,options)=>{
    const payload=JSON.parse(options.body);calls.push({url,payload});
    const body=JSON.parse(payload.messages[1].content.split('\n\n').at(-1));
    return Response.json({choices:[{message:{content:JSON.stringify({nodes:candidates(body.count)})}}]});
  }});
  await client.request('/model',connection);
  for(const count of [3,6,10]){
    const result=await client.request('/generate',{...input,count});assert.equal(result.nodes.length,count);
    assert.equal(result.mode,'live');assert.ok(result.nodes.every(n=>n.inspiration));
  }
  await assert.rejects(()=>client.request('/generate',{...input,count:4}),/3、6 或 10/);assert.equal(calls.length,3);
});

async function request(server,body){
  const req=Readable.from([Buffer.from(JSON.stringify(body))]);Object.assign(req,{method:'POST',url:'/api/generate',headers:{host:'127.0.0.1:4181'}});
  const res=new EventEmitter();Object.assign(res,{writableEnded:false,destroyed:false});
  res.writeHead=status=>{res.statusCode=status;return res;};res.end=value=>{res.body=value;res.writableEnded=true;return res;};
  await server.listeners('request')[0](req,res);return {status:res.statusCode,body:JSON.parse(res.body)};
}
test('本地模型端接受灵感请求，保留结构；未连接时不会伪装成真实生成',async()=>{
  const forwarded=[];const server=createPrototypeServer(connection,{fetcher:async(_url,options)=>{
    const payload=JSON.parse(options.body);forwarded.push(payload);
    const body=JSON.parse(payload.messages[1].content.split('\n\n').at(-1));
    return Response.json({choices:[{message:{content:JSON.stringify({nodes:candidates(body.count)})}}]});
  }});
  for(const count of [3,6,10]){const result=await request(server,{...input,count});assert.equal(result.status,200);assert.equal(result.body.nodes.length,count);}
  assert.equal((await request(server,{...input,count:4})).status,400);assert.equal(forwarded.length,3);
  const disconnected=await request(createPrototypeServer(),{...input,demo:true});assert.equal(disconnected.status,503);
});
