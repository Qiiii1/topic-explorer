import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,rootOf,appendManual,appendGenerated,assignParent,mergeNodes,getPaths,favoriteNode,removeBranch,visibleNodes,validateProject,toMarkdown} from '../app/domain.js';

const candidate=(title='候选')=>({title,description:'待调研的方向',rationale:'从上层观察进一步缩小研究范围。'});
test('手动卡片先独立创建；指定上层后保留路径，并禁止循环',()=>{
  const p=createProject('多人协作中的想法流失'),root=rootOf(p);
  const a=appendManual(p,null,'pain','不清楚讨论为什么转向');
  assert.deepEqual(a.parentIds,[]);assert.equal(p.edges.length,0);
  assignParent(p,a.id,root.id);
  const b=appendGenerated(p,a.id,'people',[candidate('项目初学者')],'live')[0];
  assert.deepEqual(getPaths(p,b.id)[0].map(n=>n.id),[root.id,a.id,b.id]);
  assert.throws(()=>assignParent(p,a.id,b.id),/循环/);
  assert.equal(validateProject(p).nodes.length,3);
});
test('同类交集保留两张源卡片和两条上游路径',()=>{
  const p=createProject('城市生活'),root=rootOf(p);
  const [a,b]=appendGenerated(p,root.id,'people',[candidate('独居者'),candidate('新居民')]);
  const n=mergeNodes(p,a.id,b.id,candidate('独居的新居民'));
  assert.equal(p.nodes.length,4);assert.equal(getPaths(p,n.id).length,2);
  assert.deepEqual(new Set(n.parentIds),new Set([a.id,b.id]));
  assert.throws(()=>mergeNodes(p,a.id,root.id,candidate()),/同类/);
  assert.equal(validateProject(p).edges.length,4);
});
test('收藏是完整快照，编辑和删除画布不会改写收藏',()=>{
  const p=createProject('城市生活'),root=rootOf(p);
  const [a,b]=appendGenerated(p,root.id,'people',[candidate('独居者'),candidate('新居民')]);
  const n=mergeNodes(p,a.id,b.id,candidate('独居的新居民'));
  const saved=favoriteNode(p,n.id);a.title='已修改';removeBranch(p,n.id);
  assert.equal(saved.snapshot.paths.length,2);
  assert.equal(saved.snapshot.nodes.find(v=>v.id===a.id).title,'独居者');
  assert.match(toMarkdown(p,saved),/独居的新居民/);
  assert.equal(validateProject(p).favorites.length,1);
});
test('共享交集在移除其中一侧来源后继续存在',()=>{
  const p=createProject('城市生活'),root=rootOf(p);
  const [a,b]=appendGenerated(p,root.id,'scene',[candidate('社区'),candidate('街道')]);
  const n=mergeNodes(p,a.id,b.id,candidate('社区街道'));removeBranch(p,a.id);
  assert.deepEqual(p.nodes.find(v=>v.id===n.id).parentIds,[b.id]);
  assert.equal(getPaths(p,n.id).length,1);assert.equal(validateProject(p).nodes.length,3);
  p.nodes.find(v=>v.id===b.id).hidden=true;assert.equal(visibleNodes(p).length,1);assert.equal(visibleNodes(p,{showHidden:true}).length,3);
});
test('导入拒绝循环、失效路径和带标记的节点 ID',()=>{
  const p=createProject('探索');const n=appendManual(p,null,'scene','观察');
  n.id='bad" onclick="';assert.throws(()=>validateProject(p),/格式/);
  const q=createProject('探索');const a=appendManual(q,null,'pain','困惑');a.parentIds=[a.id];assert.throws(()=>validateProject(q),/循环/);
});
