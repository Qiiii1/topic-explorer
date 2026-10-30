import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,rootOf,appendGenerated,mergeNodes,favoriteNode,planGenerationSpace,validateProject,CARD,LAYOUT_GAP} from '../app/domain.js';
import {editCard,selectionRelations} from '../app/card-editing.js';
import {sceneRelations,edgeSceneCategories,inferSceneCategory} from '../app/scene-categories.js';
import {generationPayload,validateCandidates} from '../app/model-protocol.js';
const candidate=title=>({title,rationale:'从上层细化'});

test('编辑卡片保留身份和位置，更新关联理由与下一次模型输入，收藏快照不改变',()=>{
  const p=createProject('旧研究兴趣'),root=rootOf(p),[scene]=appendGenerated(p,root.id,'scene',[candidate('地铁等待')]);
  const saved=favoriteNode(p,scene.id),original=structuredClone(scene);
  editCard(p,scene.id,{title:'社区花园的偶遇',description:'只关注夜间停留',rationale:'将宽泛兴趣聚焦到居民夜间活动',sceneCategory:'community'});
  assert.deepEqual([scene.id,scene.x,scene.y,scene.parentIds],[original.id,original.x,original.y,original.parentIds]);
  assert.equal(p.edges.find(edge=>edge.to===scene.id).rationale,scene.rationale);
  assert.equal(saved.snapshot.nodes.find(node=>node.id===scene.id).title,'地铁等待');
  editCard(p,root.id,{title:'只研究社区中的夜间活动'});
  assert.equal(p.description,root.description);assert.equal(root.title,p.description);
  const input={operation:'expand',project:{description:p.description},node:scene,targetKind:'pain',count:3};
  const payload=generationPayload(input,{model:'test'});
  assert.ok(payload.messages[1].content.includes('社区花园的偶遇'));
  assert.ok(payload.messages[1].content.includes('只研究社区中的夜间活动'));
  assert.throws(()=>editCard(p,scene.id,{title:'  '}),/请写下/);validateProject(p);
});

test('同类场景跨分支同色，非场景继承最近场景，共享节点保留两侧分类且可人工更正',()=>{
  const p=createProject('城市'),root=rootOf(p),[a,b,c]=appendGenerated(p,root.id,'scene',['社区花园','邻里活动','通勤地铁'].map(candidate));
  const painA=appendGenerated(p,a.id,'pain',[candidate('不愿打扰')])[0];
  const painC=appendGenerated(p,c.id,'pain',[candidate('信息不清楚')])[0];
  const shared=mergeNodes(p,painA.id,painC.id,candidate('共同体验'));
  const leaf=appendGenerated(p,shared.id,'people',[candidate('初次来的人')])[0];
  let relations=sceneRelations(p);
  assert.deepEqual(relations.get(a.id),relations.get(b.id));
  assert.deepEqual(relations.get(leaf.id),['community','commute']);
  const incoming=p.edges.filter(edge=>edge.to===shared.id);
  assert.deepEqual(incoming.map(edge=>edgeSceneCategories(p,edge,relations)[0]),['community','commute']);
  editCard(p,b.id,{title:'校园晚间自习',sceneCategory:'learning'});
  relations=sceneRelations(p);assert.deepEqual(relations.get(b.id),['learning']);
  delete a.sceneCategory;assert.equal(inferSceneCategory(a),'community');
  const imported=validateProject(JSON.parse(JSON.stringify(p)));assert.equal(imported.nodes.find(node=>node.id===b.id).sceneCategory,'learning');
  const result=validateCandidates({nodes:[{...candidate('自习空间'),sceneCategory:'learning'},{...candidate('未知分类'),sceneCategory:'<script>'}]},3);
  assert.equal(result.nodes[0].sceneCategory,'learning');assert.equal(result.nodes[1].sceneCategory,undefined);
});

test('选择仅强调所有上游和直接下一级，不把孙级或旁支当作下一级',()=>{
  const p=createProject('城市'),root=rootOf(p),[a,b]=appendGenerated(p,root.id,'scene',['社区','地铁'].map(candidate));
  const child=appendGenerated(p,a.id,'pain',[candidate('停留')])[0];
  const grandchild=appendGenerated(p,child.id,'people',[candidate('居民')])[0];
  const shared=mergeNodes(p,a.id,b.id,candidate('共同场景'));
  const {upstream,children}=selectionRelations(p,a.id);
  assert.deepEqual(upstream,new Set([root.id,a.id]));assert.deepEqual(children,new Set([child.id,shared.id]));
  assert.equal(children.has(grandchild.id),false);assert.equal(children.has(b.id),false);
  assert.deepEqual(selectionRelations(p,null),{upstream:new Set(),children:new Set()});
});

test('拥挤来源向外避让，预览不修改项目；成功沿用整批布局并保留根节点与全部关联',()=>{
  for(const count of [3,6,10]){
    const p=createProject('城市'),root=rootOf(p),[source]=appendGenerated(p,root.id,'scene',[candidate('社区')]);
    Object.assign(source,{x:400,y:0});
    const children=appendGenerated(p,source.id,'pain',Array.from({length:10},(_,i)=>candidate('已有'+i)));
    children.forEach((node,i)=>Object.assign(node,{x:400+(i%4-1)*90,y:Math.floor(i/4)*100}));
    const before=structuredClone(p),plan=planGenerationSpace(p,source.id,count);
    assert.deepEqual(p,before);assert.ok(plan.moves.has(source.id));
    assert.ok(Math.hypot(plan.anchor.x-source.x,plan.anchor.y-source.y)>LAYOUT_GAP.y/2);
    assert.ok(plan.positions.every(pos=>Math.abs(pos.x-plan.anchor.x)<=2*LAYOUT_GAP.x&&Math.abs(pos.y-plan.anchor.y)<=2*LAYOUT_GAP.y));
    const created=appendGenerated(p,source.id,'people',Array.from({length:count},(_,i)=>candidate('新增'+i)),'live',plan);
    assert.deepEqual(created.map(({x,y})=>({x,y})),plan.positions);
    for(const old of before.nodes){const position=plan.moves.get(old.id)||old,next=p.nodes.find(node=>node.id===old.id);assert.deepEqual([next.x,next.y],[position.x,position.y]);}
    assert.deepEqual(root,before.nodes[0]);assert.deepEqual(p.edges.slice(0,before.edges.length),before.edges);
    for(let i=0;i<p.nodes.length;i++)for(let j=i+1;j<p.nodes.length;j++)assert.equal(Math.abs(p.nodes[i].x-p.nodes[j].x)<CARD.width+28&&Math.abs(p.nodes[i].y-p.nodes[j].y)<CARD.height+28,false);
    validateProject(p);
  }
});
