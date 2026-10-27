import test from 'node:test';
import assert from 'node:assert/strict';
import {CARD,LAYOUT_GAP,createProject,rootOf,appendGenerated,appendManual,mergeNodes,getPaths,validateProject,planNearbySpace,branchPositions,moveBranch,arrangeByMainline,canCombine,repelCards,spreadCrowdedCards} from '../app/domain.js';

const overlaps=(a,b,gap=0)=>Math.abs(a.x-b.x)<CARD.width+gap&&Math.abs(a.y-b.y)<CARD.height+gap;

test('连续生成 3/6/10 张候选始终留在来源附近，原有卡片让位且选题中心保持不动',()=>{
  for(const count of [3,6,10]){
    const p=createProject('城市生活'),root=rootOf(p),original=structuredClone(root);
    for(let batch=0;batch<3;batch++){
      const {positions}=planNearbySpace(p.nodes,root,count);
      assert.ok(positions.some(n=>n.x<root.x)&&positions.some(n=>n.x>root.x));
      assert.ok(positions.some(n=>n.y<root.y)&&positions.some(n=>n.y>root.y));
      assert.ok(positions.every(n=>Math.abs(n.x-root.x)<=2*LAYOUT_GAP.x&&Math.abs(n.y-root.y)<=2*LAYOUT_GAP.y));
      const created=appendGenerated(p,root.id,'scene',positions.map((_,i)=>({title:`候选 ${i}`,rationale:'由上层细化'})),'live',positions);
      assert.deepEqual({x:created[0].x,y:created[0].y},positions[0]);
      for(let i=0;i<p.nodes.length;i++)for(let j=i+1;j<p.nodes.length;j++)assert.equal(overlaps(p.nodes[i],p.nodes[j],28),false);
    }
    assert.deepEqual(root,original);
  }
});

test('预留位置只是预览，取消不改写项目；完成后沿用预览位置且上游不移动',()=>{
  const p=createProject('城市生活'),root=rootOf(p);
  const parent=appendGenerated(p,root.id,'scene',[{title:'社区'}])[0];
  appendGenerated(p,parent.id,'pain',Array.from({length:10},(_,i)=>({title:`原想法${i}`})));
  const before=structuredClone(p),protectedIds=new Set([root.id,parent.id]);
  const plan=planNearbySpace(p.nodes,parent,10,protectedIds);
  assert.deepEqual(p,before);assert.ok(plan.moves.size>0);
  const created=appendGenerated(p,parent.id,'people',Array.from({length:10},(_,i)=>({title:`新想法${i}`})),'live',plan.positions);
  assert.deepEqual(created.map(n=>({x:n.x,y:n.y})),plan.positions);
  for(const id of protectedIds){const node=p.nodes.find(n=>n.id===id),old=before.nodes.find(n=>n.id===id);assert.equal(node.x,old.x);assert.equal(node.y,old.y);}
  for(const node of before.nodes){const move=plan.moves.get(node.id),next=p.nodes.find(n=>n.id===node.id);assert.equal(next.x,move?.x??node.x);assert.equal(next.y,move?.y??node.y);}
  for(let i=0;i<p.nodes.length;i++)for(let j=i+1;j<p.nodes.length;j++)assert.equal(overlaps(p.nodes[i],p.nodes[j],28),false);
});

test('分支拖动包含隐藏下级和共享交集，所有成员保持相对位置且只移动一次',()=>{
  const p=createProject('城市生活'),root=rootOf(p);
  const [a,b]=appendGenerated(p,root.id,'scene',[{title:'社区'},{title:'街道'}]);
  const child=appendGenerated(p,a.id,'pain',[{title:'停留'}])[0];child.hidden=true;
  const shared=mergeNodes(p,a.id,b.id,{title:'社区街道'});
  const leaf=appendGenerated(p,shared.id,'people',[{title:'新居民'}])[0];
  const before=structuredClone(p),origins=branchPositions(p,a.id);
  assert.deepEqual(new Set(origins.keys()),new Set([a.id,child.id,shared.id,leaf.id]));
  moveBranch(p,origins,190,-95);moveBranch(p,origins,230,-120);
  const fixedIds=new Set(origins.keys()),activeIds=new Set(fixedIds);
  for(let i=0;i<100;i++)repelCards(p.nodes,a.id,{activeIds,fixedIds});
  for(const [id,origin] of origins){const node=p.nodes.find(n=>n.id===id);assert.equal(node.x,origin.x+230);assert.equal(node.y,origin.y-120);}
  assert.deepEqual(getPaths(p,shared.id).map(path=>path.map(n=>n.id)),getPaths(before,shared.id).map(path=>path.map(n=>n.id)));
  assert.equal(validateProject(p).nodes.length,p.nodes.length);
});

test('一键按主线整理：分支不重叠、两侧平衡、共享连线和独立想法保留，重复整理稳定',()=>{
  const p=createProject('城市生活'),root=rootOf(p);
  const branches=appendGenerated(p,root.id,'scene',Array.from({length:7},(_,i)=>({title:`主线${i}`})));
  for(const branch of branches){const kids=appendGenerated(p,branch.id,'pain',Array.from({length:4},(_,i)=>({title:`痛点${i}`})));appendGenerated(p,kids[0].id,'people',[{title:'居民'}]);}
  const shared=mergeNodes(p,branches[0].id,branches[3].id,{title:'共同场景'});
  appendGenerated(p,shared.id,'people',[{title:'共享人群'}]);
  const independent=appendManual(p,null,'scene','独立方向');appendGenerated(p,independent.id,'pain',[{title:'独立痛点'}]);
  const graph=structuredClone(p.edges),paths=getPaths(p,shared.id).map(path=>path.map(n=>n.id));
  for(const n of p.nodes){n.x=100;n.y=100;}
  arrangeByMainline(p);
  assert.ok(branches.some(n=>n.x<root.x)&&branches.some(n=>n.x>root.x));
  for(let i=0;i<p.nodes.length;i++)for(let j=i+1;j<p.nodes.length;j++)assert.equal(overlaps(p.nodes[i],p.nodes[j],60),false,`${p.nodes[i].title} / ${p.nodes[j].title}`);
  assert.deepEqual(p.edges,graph);assert.deepEqual(getPaths(p,shared.id).map(path=>path.map(n=>n.id)),paths);assert.deepEqual(independent.parentIds,[]);
  const once=structuredClone(p);arrangeByMainline(p);assert.deepEqual(p,once);validateProject(p);
});

test('连接高亮与实际组合共用同一规则：只允许不同的同维度次级卡片',()=>{
  const nodes=['root','scene','pain','people'].flatMap(kind=>[0,1].map(i=>({id:`${kind}${i}`,kind})));
  for(const a of nodes)for(const b of nodes)assert.equal(canCombine(a,b),a.id!==b.id&&a.kind===b.kind&&a.kind!=='root');
  assert.equal(canCombine(undefined,nodes[0]),false);
});

test('拖动时固定所拖卡片，邻近卡片连锁避让，远处原有布局保持不动',()=>{
  const nodes=[{id:'dragged',x:0,y:0},{id:'near',x:210,y:0},{id:'chain',x:460,y:0},{id:'far-a',x:5000,y:5000},{id:'far-b',x:5001,y:5001}];
  const activeIds=new Set(['dragged']),far=structuredClone(nodes.slice(3));
  for(let frame=0;frame<240;frame++)repelCards(nodes,'dragged',{activeIds});
  assert.deepEqual(nodes[0],{id:'dragged',x:0,y:0});
  assert.ok(nodes[1].x>210&&nodes[2].x>460);
  assert.equal(overlaps(nodes[0],nodes[1],35),false);
  assert.equal(overlaps(nodes[1],nodes[2],35),false);
  assert.deepEqual(nodes.slice(3),far);
  assert.ok(nodes.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)));
});


test('自动疏散拥挤区域：中心固定、预留间距、布局有限且不更改关联',()=>{
  const p=createProject('拥挤区域'),root=rootOf(p);
  const kids=appendGenerated(p,root.id,'scene',Array.from({length:10},(_,i)=>({title:'卡片'+i})));
  for(const [i,n] of kids.entries()){n.x=10+(i%4)*80;n.y=10+Math.floor(i/4)*60;}
  const edges=structuredClone(p.edges),before={x:root.x,y:root.y};
  assert.ok(spreadCrowdedCards(p.nodes,new Set([root.id])).size>0);
  assert.deepEqual({x:root.x,y:root.y},before);assert.deepEqual(p.edges,edges);
  for(let i=0;i<p.nodes.length;i++)for(let j=i+1;j<p.nodes.length;j++)assert.equal(overlaps(p.nodes[i],p.nodes[j],110),false);
  assert.ok(p.nodes.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)));
});
