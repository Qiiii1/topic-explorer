import test from 'node:test';
import assert from 'node:assert/strict';
import {CARD,createProject,rootOf,appendGenerated,mergeNodes,favoriteNode,nodesInRect,selectionExport,importSelection,branchPositions,moveBranch,validateProject,toMarkdown} from '../app/domain.js';
const candidate=title=>({title,description:'选中的内容',rationale:'所选卡片的细化理由'});
test('框选命中卡片相交区域，边界接触不误选，不依赖框选方向',()=>{
 const nodes=[{id:'a',x:-100,y:20},{id:'b',x:300,y:100},{id:'c',x:300,y:600}];
 assert.deepEqual(nodesInRect(nodes,{x:0,y:0,width:350,height:200}),['a','b']);
 assert.deepEqual(nodesInRect(nodes,{x:300+CARD.width,y:100,width:20,height:20}),[]);
 assert.deepEqual(nodesInRect(nodes,{x:-100,y:20,width:CARD.width,height:CARD.height}),['a']);
});
test('框选导出只含所选卡片和内部连线，不带入未选来源、收藏与项目背景；可重新导入',()=>{
 const p=createProject('未选中的原始粗想法','选题项目'),root=rootOf(p);p.context='未选择的项目背景';
 const [a,b]=appendGenerated(p,root.id,'scene',[candidate('被选场景'),candidate('不能导出的场景')]);
 const child=appendGenerated(p,a.id,'pain',[candidate('被选痛点')])[0];favoriteNode(p,b.id);
 const before=structuredClone(p),packet=selectionExport(p,[a.id,child.id]),json=JSON.stringify(packet);
 assert.deepEqual(p,before);assert.deepEqual(packet.nodes.map(n=>n.id),[a.id,child.id]);assert.equal(packet.edges.length,1);
 assert.doesNotMatch(json,/未选中的原始粗想法|不能导出的场景|未选择的项目背景/);assert.deepEqual(packet.favorites,[]);
 const imported=importSelection(packet);assert.equal(imported.nodes.length,3);assert.equal(imported.edges.length,2);validateProject(imported);
 assert.match(toMarkdown(packet),/被选场景/);assert.doesNotMatch(toMarkdown(packet),/不能导出的场景/);
});
test('导出包含中心时保留原中心；跨来源选区保留所有被选中的内部交集连线',()=>{
 const p=createProject('原始选题'),root=rootOf(p),[a,b]=appendGenerated(p,root.id,'people',[candidate('独居者'),candidate('新居民')]);
 const shared=mergeNodes(p,a.id,b.id,candidate('独居的新居民'));
 const packet=selectionExport(p,[root.id,a.id,b.id,shared.id]);assert.equal(packet.edges.length,4);
 assert.equal(importSelection(packet).nodes.length,4);
 const partial=selectionExport(p,[a.id,shared.id]);assert.deepEqual(partial.nodes.find(n=>n.id===shared.id).parentIds,[a.id]);
 assert.equal(partial.edges.length,1);validateProject(importSelection(partial));
 partial.nodes[0].parentIds=['missing'];assert.throws(()=>importSelection(partial),/来源|连线/);
 assert.throws(()=>selectionExport(p,[]),/框选/);
});
test('多个分支一起移动时共享后代只移动一次，保持每张卡片相对位置',()=>{
 const p=createProject('原始选题'),root=rootOf(p),[a,b]=appendGenerated(p,root.id,'people',[candidate('独居者'),candidate('新居民')]);
 const shared=mergeNodes(p,a.id,b.id,candidate('交集')),origins=branchPositions(p,[a.id,b.id]),before=structuredClone(p);
 assert.equal(origins.size,3);moveBranch(p,origins,80,-40);
 for(const [id,pos] of origins){const node=p.nodes.find(n=>n.id===id);assert.equal(node.x,pos.x+80);assert.equal(node.y,pos.y-40);}
 assert.equal(p.nodes.find(n=>n.id===shared.id).parentIds.length,2);assert.deepEqual(p.edges,before.edges);validateProject(p);
});
