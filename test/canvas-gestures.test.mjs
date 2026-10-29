import test from 'node:test';
import assert from 'node:assert/strict';
import {wheelIntent,gestureFactor,pinchSensitivity,zoomView} from '../app/canvas-gestures.js';

const viewport={width:1440,height:900};
test('双指纵向、横向和斜向滑动始终平移，只有捏合 wheel 才缩放',()=>{
  for(const [deltaX,deltaY] of [[0,120],[120,0],[24,120],[-40,-30]]){
    assert.deepEqual(wheelIntent({deltaX,deltaY,deltaMode:0,ctrlKey:false},viewport),{type:'pan',dx:deltaX,dy:deltaY});
  }
  assert.equal(wheelIntent({deltaX:0,deltaY:40,deltaMode:0,metaKey:true},viewport).type,'pan');
  assert.ok(wheelIntent({deltaX:0,deltaY:-20,deltaMode:0,ctrlKey:true},viewport).factor>1);
  assert.ok(wheelIntent({deltaX:0,deltaY:20,deltaMode:0,ctrlKey:true},viewport).factor<1);
});
test('兼容滚动单位，缩放灵敏度随视口变化且不会因极端尺寸失控',()=>{
  assert.deepEqual(wheelIntent({deltaX:1,deltaY:2,deltaMode:1},viewport),{type:'pan',dx:16,dy:32});
  assert.deepEqual(wheelIntent({deltaX:1,deltaY:1,deltaMode:2},viewport),{type:'pan',dx:1440,dy:900});
  assert.ok(pinchSensitivity({width:375,height:812})<pinchSensitivity(viewport));
  for(const size of [1,300,900,10000])assert.ok(pinchSensitivity({width:size,height:size})>=0.8&&pinchSensitivity({width:size,height:size})<=1.15);
});
test('缩放以手势位置为中心；Safari 连续捏合使用增量，达到上限后可以立即缩回',()=>{
  const before={x:30,y:-40,scale:0.8},point={x:420,y:280};
  const after=zoomView(before,1.3,point);
  assert.ok(Math.abs((point.x-before.x)/before.scale-(point.x-after.x)/after.scale)<1e-9);
  assert.ok(Math.abs((point.y-before.y)/before.scale-(point.y-after.y)/after.scale)<1e-9);
  const factor=gestureFactor(1.5,1.25,viewport);
  assert.ok(Math.abs(factor-Math.pow(1.2,pinchSensitivity(viewport)))<1e-9);
  assert.ok(zoomView({x:0,y:0,scale:1.75},gestureFactor(1.4,1.5,viewport),point).scale<1.75);
  assert.equal(gestureFactor(NaN,1,viewport),1);
  assert.equal(zoomView(before,100,point).scale,1.75);
});
