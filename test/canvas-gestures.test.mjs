import test from 'node:test';
import assert from 'node:assert/strict';
import {wheelIntent,gestureFactor,pinchSensitivity,zoomView} from '../app/canvas-gestures.js';

const viewport={width:1440,height:900};
test('普通双指滑动始终平移，捏合 wheel 与 Command 滚轮才缩放',()=>{
  for(const [deltaX,deltaY] of [[0,120],[120,0],[24,120],[-40,-30]]){
    assert.deepEqual(wheelIntent({deltaX,deltaY,deltaMode:0,ctrlKey:false},viewport),{type:'pan',dx:deltaX,dy:deltaY});
  }
  assert.equal(wheelIntent({deltaX:0,deltaY:40,deltaMode:0,metaKey:true},viewport).type,'zoom');
  assert.ok(wheelIntent({deltaX:0,deltaY:-20,deltaMode:0,ctrlKey:true},viewport).factor>1);
  assert.ok(wheelIntent({deltaX:0,deltaY:20,deltaMode:0,ctrlKey:true},viewport).factor<1);
});
test('Command 滚轮上下分别放大缩小，围绕指针缩放且不混入横向平移',()=>{
  const before={x:-140,y:80,scale:.75},point={x:500,y:400};
  for(const deltaMode of [0,1,2])for(const sign of [-1,1]){
    const intent=wheelIntent({deltaX:30,deltaY:sign*(deltaMode===2?1:40),deltaMode,metaKey:true},viewport);
    assert.equal(intent.type,'zoom');
    assert.equal(intent.factor>1,sign<0);
    const after=zoomView(before,intent.factor,point);
    assert.equal(after.scale>before.scale,sign<0);
    assert.ok(Math.abs((point.x-before.x)/before.scale-(point.x-after.x)/after.scale)<1e-9);
    assert.ok(Math.abs((point.y-before.y)/before.scale-(point.y-after.y)/after.scale)<1e-9);
  }
  const mouse=wheelIntent({deltaX:0,deltaY:-100,metaKey:true},viewport),pinch=wheelIntent({deltaX:0,deltaY:-100,ctrlKey:true},viewport);
  assert.ok(mouse.factor>1&&mouse.factor<pinch.factor);
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
