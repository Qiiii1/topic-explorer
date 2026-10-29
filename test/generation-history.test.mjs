import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,rootOf,appendGenerated,appendManual,mergeNodes,favoriteNode,assignParent,removeBranch,validateProject,clone} from '../app/domain.js';
import {GenerationHistory} from '../app/generation-history.js';

const candidate=title=>({title,description:'候选说明',rationale:'从来源进一步细化'});
const setup=()=>{const p=createProject('探索公共空间','测试');return {p,root:rootOf(p),history:new GenerationHistory()};};
test('只撤回生成批次：后续移动、手动卡片、编辑、收藏和背景均保留',()=>{
  const {p,root,history}=setup();
  const generated=appendGenerated(p,root.id,'scene',[candidate('甲'),candidate('乙')],'live');history.record(generated);
  root.x=1080;root.title='手动编辑的标题';p.context='后续补充的背景';
  const manual=appendManual(p,null,'people','手动卡片');manual.x=412;
  const saved=favoriteNode(p,generated[0].id),favorites=clone(p.favorites);
  const removed=history.undo(p);
  assert.equal(removed.length,2);assert.equal(p.nodes.length,2);
  assert.equal(root.title,'手动编辑的标题');assert.equal(root.x,1080);
  assert.equal(p.context,'后续补充的背景');assert.equal(manual.x,412);
  assert.deepEqual(p.favorites,favorites);assert.equal(p.favorites[0].id,saved.id);
  assert.equal(history.canUndo(p),false);assert.equal(history.canRedo(),true);
  validateProject(p);
  history.redo(p);assert.equal(p.nodes.length,4);assert.equal(manual.x,412);validateProject(p);
});
test('连续两次生成按批次撤回和恢复，恢复保留生成卡片最后的编辑与位置',()=>{
  const {p,root,history}=setup();
  const first=appendGenerated(p,root.id,'scene',[candidate('一')],'live');history.record(first);
  const second=appendGenerated(p,first[0].id,'pain',[candidate('二')],'live');history.record(second);
  second[0].title='修改后的二';second[0].x=1888;
  history.undo(p);assert.ok(p.nodes.some(node=>node.id===first[0].id));
  history.undo(p);assert.equal(p.nodes.length,1);
  history.redo(p);history.redo(p);
  assert.equal(p.nodes.find(node=>node.id===second[0].id).title,'修改后的二');
  assert.equal(p.nodes.find(node=>node.id===second[0].id).x,1888);validateProject(p);
});
test('组合生成只撤回交集，保留两个来源；手动后代保留为独立卡片并能恢复关联',()=>{
  const {p,root,history}=setup();
  const sources=appendGenerated(p,root.id,'scene',[candidate('甲'),candidate('乙')],'live');
  const merged=mergeNodes(p,sources[0].id,sources[1].id,candidate('交集'),'live');history.record([merged]);
  const child=appendManual(p,merged.id,'pain','手动后代');
  history.undo(p);
  assert.equal(p.nodes.length,4);assert.deepEqual(child.parentIds,[]);validateProject(p);
  history.redo(p);assert.deepEqual(child.parentIds,[merged.id]);
  assert.equal(p.nodes.find(node=>node.id===merged.id).parentIds.length,2);validateProject(p);
});
test('恢复生成不覆盖撤回期间的手动归属，也不恢复已经删除的来源或产生循环',()=>{
  const {p,root,history}=setup();
  const source=appendManual(p,root.id,'scene','来源');
  const generated=appendGenerated(p,source.id,'pain',[candidate('生成')],'live');history.record(generated);
  const child=appendManual(p,generated[0].id,'people','手动后代');
  history.undo(p);assignParent(p,child.id,root.id);removeBranch(p,source.id);
  history.redo(p);
  assert.deepEqual(child.parentIds,[root.id]);assert.deepEqual(p.nodes.find(node=>node.id===generated[0].id).parentIds,[]);validateProject(p);
});
test('已手动删除的生成记录不会误撤回其他编辑；新生成会清空恢复栈',()=>{
  const {p,root,history}=setup();
  const generated=appendGenerated(p,root.id,'scene',[candidate('旧')],'live');history.record(generated);
  removeBranch(p,generated[0].id);root.title='保留';assert.equal(history.canUndo(p),false);assert.deepEqual(history.undo(p),[]);assert.equal(root.title,'保留');
  const next=appendGenerated(p,root.id,'scene',[candidate('新')],'live');history.record(next);history.undo(p);assert.equal(history.canRedo(),true);
  history.record(appendGenerated(p,root.id,'people',[candidate('新一批')],'live'));assert.equal(history.canRedo(),false);validateProject(p);
});

test('恢复旧关联时跳过会与新手动归属形成循环的连线',()=>{
  const {p,root,history}=setup();
  const source=appendManual(p,root.id,'scene','来源');
  const generated=appendGenerated(p,source.id,'pain',[candidate('生成')],'live');history.record(generated);
  const child=appendManual(p,generated[0].id,'people','后代');
  history.undo(p);assignParent(p,source.id,child.id);
  history.redo(p);
  assert.deepEqual(child.parentIds,[]);assert.deepEqual(source.parentIds,[child.id]);validateProject(p);
});
