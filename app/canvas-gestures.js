const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

// Panning keeps native pixel speed; pinch and Command-wheel zoom adapt gently to the viewport.
export function pinchSensitivity({width,height}){
  return clamp(Math.sqrt(Math.min(width,height)/800),0.8,1.15);
}

export function wheelIntent(event,viewport){
  const unit=event.deltaMode===1?16:1;
  const dx=event.deltaX*(event.deltaMode===2?viewport.width:unit);
  const dy=event.deltaY*(event.deltaMode===2?viewport.height:unit);
  if(!event.ctrlKey&&!event.metaKey)return {type:'pan',dx,dy};
  const speed=event.metaKey&&!event.ctrlKey?0.0025:0.01;
  return {type:'zoom',factor:Math.exp(clamp(-dy*speed*pinchSensitivity(viewport),-0.6,0.6))};
}

export function gestureFactor(scale,previousScale,viewport){
  if(!Number.isFinite(scale)||scale<=0||!Number.isFinite(previousScale)||previousScale<=0)return 1;
  return Math.pow(clamp(scale/previousScale,0.5,2),pinchSensitivity(viewport));
}

export function zoomView(view,factor,point){
  const scale=clamp(view.scale*factor,0.08,1.75),ratio=scale/view.scale;
  return {scale,x:point.x-(point.x-view.x)*ratio,y:point.y-(point.y-view.y)*ratio};
}
