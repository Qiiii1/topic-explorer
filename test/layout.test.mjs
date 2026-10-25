import test from 'node:test';
import assert from 'node:assert/strict';
import {CARD,createProject,rootOf,surroundingPositions,appendGenerated,repelCards} from '../app/domain.js';

const overlaps=(a,b,gap=0)=>Math.abs(a.x-b.x)<CARD.width+gap&&Math.abs(a.y-b.y)<CARD.height+gap;

test('3/6/10 张候选分布在来源四周，连续生成避开已有卡片且不重排原内容',()=>{
  for(const count of [3,6,10]){
    const p=createProject('城市生活'),root=rootOf(p),original=structuredClone(root);
    for(let batch=0;batch<3;batch++){
      const positions=surroundingPositions(p.nodes,root,count);
      assert.ok(positions.some(n=>n.x<root.x)&&positions.some(n=>n.x>root.x));
      assert.ok(positions.some(n=>n.y<root.y)&&positions.some(n=>n.y>root.y));
      const created=appendGenerated(p,root.id,'scene',positions.map((_,i)=>({title:`候选 ${i}`,rationale:'由上层细化'})),'live',positions);
      assert.deepEqual({x:created[0].x,y:created[0].y},positions[0]);
      for(let i=0;i<p.nodes.length;i++)for(let j=i+1;j<p.nodes.length;j++)assert.equal(overlaps(p.nodes[i],p.nodes[j],28),false);
    }
    assert.deepEqual(root,original);
  }
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
