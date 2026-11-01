// Adapted from the project's supplied Logo_Animation_V14_Adjustable_Speed.html.
const SVG = "<svg id=\"stage\" viewBox=\"0 0 1546 1017\" xmlns=\"http://www.w3.org/2000/svg\" aria-hidden=\"true\" focusable=\"false\">\n<defs>\n<linearGradient id=\"purple\" x1=\".14\" y1=\".8\" x2=\".87\" y2=\".06\" objectBoundingBox=\"true\"><stop offset=\"0\" stop-color=\"#FFCCED\"/><stop offset=\".4\" stop-color=\"#E69AFA\"/><stop offset=\".73\" stop-color=\"#AA9BEF\"/><stop offset=\"1\" stop-color=\"#BDD7FF\"/></linearGradient>\n<linearGradient id=\"aqua\" x1=\".16\" y1=\".85\" x2=\".93\" y2=\".12\"><stop offset=\"0\" stop-color=\"#D7DCFF\"/><stop offset=\".3\" stop-color=\"#7BCCF4\"/><stop offset=\".6\" stop-color=\"#73E8CF\"/><stop offset=\"1\" stop-color=\"#D9FFC1\"/></linearGradient>\n<linearGradient id=\"peach\" x1=\".1\" y1=\".9\" x2=\".88\" y2=\".05\"><stop offset=\"0\" stop-color=\"#FFE5D6\"/><stop offset=\".35\" stop-color=\"#F9A9D4\"/><stop offset=\".68\" stop-color=\"#FF9A88\"/><stop offset=\"1\" stop-color=\"#FFED99\"/></linearGradient>\n<linearGradient id=\"glassSweep\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#FFFFFF\" stop-opacity=\".35\"/><stop offset=\".28\" stop-color=\"#FFFFFF\" stop-opacity=\".04\"/><stop offset=\".56\" stop-color=\"#FFFFFF\" stop-opacity=\".12\"/><stop offset=\".82\" stop-color=\"#FFFFFF\" stop-opacity=\".02\"/><stop offset=\"1\" stop-color=\"#FFFFFF\" stop-opacity=\".26\"/></linearGradient>\n<linearGradient id=\"rim\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#FFFFFF\" stop-opacity=\".72\"/><stop offset=\".44\" stop-color=\"#FFFFFF\" stop-opacity=\".07\"/><stop offset=\"1\" stop-color=\"#FFF3FF\" stop-opacity=\".46\"/></linearGradient>\n<linearGradient id=\"edgeReflection\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#FFFFFF\" stop-opacity=\".85\"/><stop offset=\".2\" stop-color=\"#FFFFFF\" stop-opacity=\".66\"/><stop offset=\".49\" stop-color=\"#FFFFFF\" stop-opacity=\".08\"/><stop offset=\".72\" stop-color=\"#FFFFFF\" stop-opacity=\".18\"/><stop offset=\"1\" stop-color=\"#FFFFFF\" stop-opacity=\".65\"/></linearGradient>\n<filter id=\"edgeBloom\" x=\"-15%\" y=\"-15%\" width=\"130%\" height=\"130%\"><feGaussianBlur stdDeviation=\"3.4\"/></filter>\n<filter id=\"frost\" x=\"-7%\" y=\"-7%\" width=\"114%\" height=\"114%\"><feGaussianBlur stdDeviation=\"5\"/></filter>\n<linearGradient id=\"wireColor\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#FAECFF\" stop-opacity=\".99\"/><stop offset=\".38\" stop-color=\"#F0F7FF\" stop-opacity=\".965\"/><stop offset=\".76\" stop-color=\"#FFFFFF\" stop-opacity=\".985\"/><stop offset=\"1\" stop-color=\"#FFF5FA\" stop-opacity=\".99\"/></linearGradient>\n<linearGradient id=\"wireShine\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#FFFFFF\" stop-opacity=\".86\"/><stop offset=\".5\" stop-color=\"#FFFFFF\" stop-opacity=\".42\"/><stop offset=\"1\" stop-color=\"#F0ECFF\" stop-opacity=\".23\"/></linearGradient>\n<radialGradient id=\"nodeGlass\" cx=\"34%\" cy=\"25%\" r=\"80%\"><stop offset=\"0\" stop-color=\"#FFFFFF\" stop-opacity=\".98\"/><stop offset=\".46\" stop-color=\"#F5FAFF\" stop-opacity=\".84\"/><stop offset=\".86\" stop-color=\"#E6DCF4\" stop-opacity=\".8\"/><stop offset=\"1\" stop-color=\"#FFFFFF\" stop-opacity=\".98\"/></radialGradient>\n<filter id=\"wireSoft\" x=\"-20%\" y=\"-80%\" width=\"140%\" height=\"260%\"><feGaussianBlur stdDeviation=\"5\"/></filter>\n<filter id=\"glow\" x=\"-35%\" y=\"-90%\" width=\"170%\" height=\"280%\"><feGaussianBlur stdDeviation=\"9\"/></filter>\n<!-- 动态遮罩：白色保留原卡片，前方卡片的黑色轮廓切除后方的交叠区域。 -->\n<mask id=\"cutLeft\" maskUnits=\"userSpaceOnUse\" x=\"0\" y=\"0\" width=\"1546\" height=\"1017\"><rect width=\"1546\" height=\"1017\" fill=\"white\"/><path id=\"cutL2\" fill=\"black\" stroke=\"black\" stroke-width=\"34\"/><path id=\"cutL3\" fill=\"black\" stroke=\"black\" stroke-width=\"34\"/></mask>\n<mask id=\"cutMiddle\" maskUnits=\"userSpaceOnUse\" x=\"0\" y=\"0\" width=\"1546\" height=\"1017\"><rect width=\"1546\" height=\"1017\" fill=\"white\"/><path id=\"cutM3\" fill=\"black\" stroke=\"black\" stroke-width=\"34\"/></mask>\n</defs>\n\n<g id=\"card1\" mask=\"url(#cutLeft)\"><path id=\"shape1\" fill=\"url(#purple)\" d=\"M270 377.0 Q270 315 327.18 291.04 L582.82 183.96 Q640 160 640 222.0 L640 538.0 Q640 600 582.82 623.96 L327.18 731.04 Q270 755 270 693.0 Z\"/><path class=\"glassSheen\" d=\"M270 377.0 Q270 315 327.18 291.04 L582.82 183.96 Q640 160 640 222.0 L640 538.0 Q640 600 582.82 623.96 L327.18 731.04 Q270 755 270 693.0 Z\" fill=\"url(#glassSweep)\" opacity=\".518\"/><path class=\"glassRim\" d=\"M270 377.0 Q270 315 327.18 291.04 L582.82 183.96 Q640 160 640 222.0 L640 538.0 Q640 600 582.82 623.96 L327.18 731.04 Q270 755 270 693.0 Z\" fill=\"none\" stroke=\"url(#rim)\" stroke-width=\"7\" opacity=\".665\"/><path class=\"glassFrost\" d=\"M270 377.0 Q270 315 327.18 291.04 L582.82 183.96 Q640 160 640 222.0 L640 538.0 Q640 600 582.82 623.96 L327.18 731.04 Q270 755 270 693.0 Z\" fill=\"none\" stroke=\"#fff\" stroke-width=\"15\" opacity=\".0945\" filter=\"url(#frost)\"/><path class=\"edgeBloom\" d=\"M270 377.0 Q270 315 327.18 291.04 L582.82 183.96 Q640 160 640 222.0 L640 538.0 Q640 600 582.82 623.96 L327.18 731.04 Q270 755 270 693.0 Z\" fill=\"none\" stroke=\"#FFFFFF\" stroke-width=\"9\" opacity=\".179\" filter=\"url(#edgeBloom)\"/><path class=\"edgeReflection\" d=\"M270 377.0 Q270 315 327.18 291.04 L582.82 183.96 Q640 160 640 222.0 L640 538.0 Q640 600 582.82 623.96 L327.18 731.04 Q270 755 270 693.0 Z\" fill=\"none\" stroke=\"url(#edgeReflection)\" stroke-width=\"3.8\" opacity=\".521\" stroke-linejoin=\"round\"/></g>\n<g id=\"card2\" mask=\"url(#cutMiddle)\"><path id=\"shape2\" fill=\"url(#aqua)\" d=\"M575 410.0 Q575 348 632.18 324.04 L887.82 216.96 Q945 193 945 255.0 L945 571.0 Q945 633 887.82 656.96 L632.18 764.04 Q575 788 575 726.0 Z\"/><path class=\"glassSheen\" d=\"M575 410.0 Q575 348 632.18 324.04 L887.82 216.96 Q945 193 945 255.0 L945 571.0 Q945 633 887.82 656.96 L632.18 764.04 Q575 788 575 726.0 Z\" fill=\"url(#glassSweep)\" opacity=\".518\"/><path class=\"glassRim\" d=\"M575 410.0 Q575 348 632.18 324.04 L887.82 216.96 Q945 193 945 255.0 L945 571.0 Q945 633 887.82 656.96 L632.18 764.04 Q575 788 575 726.0 Z\" fill=\"none\" stroke=\"url(#rim)\" stroke-width=\"7\" opacity=\".665\"/><path class=\"glassFrost\" d=\"M575 410.0 Q575 348 632.18 324.04 L887.82 216.96 Q945 193 945 255.0 L945 571.0 Q945 633 887.82 656.96 L632.18 764.04 Q575 788 575 726.0 Z\" fill=\"none\" stroke=\"#fff\" stroke-width=\"15\" opacity=\".0945\" filter=\"url(#frost)\"/><path class=\"edgeBloom\" d=\"M575 410.0 Q575 348 632.18 324.04 L887.82 216.96 Q945 193 945 255.0 L945 571.0 Q945 633 887.82 656.96 L632.18 764.04 Q575 788 575 726.0 Z\" fill=\"none\" stroke=\"#FFFFFF\" stroke-width=\"9\" opacity=\".179\" filter=\"url(#edgeBloom)\"/><path class=\"edgeReflection\" d=\"M575 410.0 Q575 348 632.18 324.04 L887.82 216.96 Q945 193 945 255.0 L945 571.0 Q945 633 887.82 656.96 L632.18 764.04 Q575 788 575 726.0 Z\" fill=\"none\" stroke=\"url(#edgeReflection)\" stroke-width=\"3.8\" opacity=\".521\" stroke-linejoin=\"round\"/></g>\n<g id=\"card3\"><path id=\"shape3\" fill=\"url(#peach)\" d=\"M870 445.0 Q870 383 927.18 359.04 L1182.82 251.96 Q1240 228 1240 290.0 L1240 606.0 Q1240 668 1182.82 691.96 L927.18 799.04 Q870 823 870 761.0 Z\"/><path class=\"glassSheen\" d=\"M870 445.0 Q870 383 927.18 359.04 L1182.82 251.96 Q1240 228 1240 290.0 L1240 606.0 Q1240 668 1182.82 691.96 L927.18 799.04 Q870 823 870 761.0 Z\" fill=\"url(#glassSweep)\" opacity=\".518\"/><path class=\"glassRim\" d=\"M870 445.0 Q870 383 927.18 359.04 L1182.82 251.96 Q1240 228 1240 290.0 L1240 606.0 Q1240 668 1182.82 691.96 L927.18 799.04 Q870 823 870 761.0 Z\" fill=\"none\" stroke=\"url(#rim)\" stroke-width=\"7\" opacity=\".665\"/><path class=\"glassFrost\" d=\"M870 445.0 Q870 383 927.18 359.04 L1182.82 251.96 Q1240 228 1240 290.0 L1240 606.0 Q1240 668 1182.82 691.96 L927.18 799.04 Q870 823 870 761.0 Z\" fill=\"none\" stroke=\"#fff\" stroke-width=\"15\" opacity=\".0945\" filter=\"url(#frost)\"/><path class=\"edgeBloom\" d=\"M870 445.0 Q870 383 927.18 359.04 L1182.82 251.96 Q1240 228 1240 290.0 L1240 606.0 Q1240 668 1182.82 691.96 L927.18 799.04 Q870 823 870 761.0 Z\" fill=\"none\" stroke=\"#FFFFFF\" stroke-width=\"9\" opacity=\".179\" filter=\"url(#edgeBloom)\"/><path class=\"edgeReflection\" d=\"M870 445.0 Q870 383 927.18 359.04 L1182.82 251.96 Q1240 228 1240 290.0 L1240 606.0 Q1240 668 1182.82 691.96 L927.18 799.04 Q870 823 870 761.0 Z\" fill=\"none\" stroke=\"url(#edgeReflection)\" stroke-width=\"3.8\" opacity=\".521\" stroke-linejoin=\"round\"/></g>\n<g id=\"circuit\">\n<path id=\"wireSoftLayer\" d=\"M430 411 L430 467 Q430 493 457 493 L744 493 L744 538 Q744 569 774 569 L1055 554\" fill=\"none\" stroke=\"#F6F5FF\" stroke-width=\"43\" stroke-linecap=\"round\" stroke-linejoin=\"round\" opacity=\".62\" filter=\"url(#wireSoft)\"/>\n<path id=\"wireGlow\" d=\"M430 411 L430 467 Q430 493 457 493 L744 493 L744 538 Q744 569 774 569 L1055 554\" fill=\"none\" stroke=\"#F8EEFF\" stroke-width=\"53\" stroke-linecap=\"round\" stroke-linejoin=\"round\" opacity=\".18\" filter=\"url(#glow)\"/>\n<path id=\"wire\" d=\"M430 411 L430 467 Q430 493 457 493 L744 493 L744 538 Q744 569 774 569 L1055 554\" fill=\"none\" stroke=\"url(#wireColor)\" stroke-width=\"38\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>\n<path id=\"wireRim\" d=\"M430 411 L430 467 Q430 493 457 493 L744 493 L744 538 Q744 569 774 569 L1055 554\" fill=\"none\" stroke=\"url(#wireShine)\" stroke-width=\"25\" stroke-linecap=\"round\" stroke-linejoin=\"round\" opacity=\".64\"/>\n<path id=\"wireCore\" d=\"M430 411 L430 467 Q430 493 457 493 L744 493 L744 538 Q744 569 774 569 L1055 554\" fill=\"none\" stroke=\"#FFFFFF\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\" opacity=\".27\"/>\n<g id=\"node1\"><circle cx=\"430\" cy=\"411\" r=\"46\" fill=\"url(#nodeGlass)\"/><circle cx=\"430\" cy=\"411\" r=\"43\" fill=\"none\" stroke=\"#FFFFFF\" stroke-opacity=\".64\" stroke-width=\"3\"/><ellipse cx=\"415\" cy=\"389\" rx=\"17\" ry=\"8\" fill=\"#FFFFFF\" opacity=\".32\" transform=\"rotate(-25 415 389)\"/></g>\n<g id=\"node2\"><circle cx=\"745\" cy=\"481\" r=\"46\" fill=\"url(#nodeGlass)\"/><circle cx=\"745\" cy=\"481\" r=\"43\" fill=\"none\" stroke=\"#FFFFFF\" stroke-opacity=\".64\" stroke-width=\"3\"/><ellipse cx=\"730\" cy=\"459\" rx=\"17\" ry=\"8\" fill=\"#FFFFFF\" opacity=\".32\" transform=\"rotate(-25 730 459)\"/></g>\n<g id=\"node3\"><circle cx=\"1055\" cy=\"554\" r=\"50\" fill=\"url(#nodeGlass)\"/><circle cx=\"1055\" cy=\"554\" r=\"47\" fill=\"none\" stroke=\"#FFFFFF\" stroke-opacity=\".64\" stroke-width=\"3\"/><ellipse cx=\"1039\" cy=\"530\" rx=\"18\" ry=\"8\" fill=\"#FFFFFF\" opacity=\".32\" transform=\"rotate(-25 1039 530)\"/></g>\n</g></svg>";

const template=document.createElement('template');
template.innerHTML=`<style>
  :host{display:block;aspect-ratio:1546/1017}
  button{display:block;width:100%;padding:0;border:0;border-radius:24px;background:transparent;color:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}
  button:focus-visible{outline:2px solid #007aff;outline-offset:6px}
  button:disabled{cursor:default}
  svg{display:block;width:100%;height:auto;overflow:hidden}
</style><button type="button" aria-label="有点想法，暂停 Logo 动画">${SVG}</button>`;

const DURATION=7200;
const clamp=value=>Math.max(0,Math.min(1,value));
const smooth=value=>{const x=clamp(value);return x*x*(3-2*x);};
const easeOut=value=>1-Math.pow(1-clamp(value),5);
const entries=[{start:120,duration:1550,dx:-740},{start:0,duration:1,dx:0},{start:310,duration:1550,dx:740}];

class AnimatedBrandLogo extends HTMLElement{
  #groups;
  #cuts;
  #wires;
  #nodes;
  #length;
  #button;
  #motion;
  #time=0;
  #last=null;
  #request=null;
  #paused=false;

  constructor(){
    super();
    const root=this.attachShadow({mode:'open'});
    root.append(template.content.cloneNode(true));
    const get=id=>root.getElementById(id);
    this.#button=root.querySelector('button');
    this.#groups=[get('card1'),get('card2'),get('card3')];
    this.#cuts=[get('cutL2'),get('cutL3'),get('cutM3')];
    this.#cuts.forEach((cut,i)=>cut.setAttribute('d',get(i===0?'shape2':'shape3').getAttribute('d')));
    this.#wires=['wire','wireGlow','wireSoftLayer','wireRim','wireCore'].map(get);
    this.#nodes=[{el:get('node1'),threshold:0,x:430,y:411},{el:get('node2'),threshold:.47,x:745,y:481},{el:get('node3'),threshold:.94,x:1055,y:554}];
    this.#button.addEventListener('click',()=>{this.#paused=!this.#paused;this.#sync();});
  }

  connectedCallback(){
    this.#length=this.#wires[0].getTotalLength();
    for(const wire of this.#wires)wire.style.strokeDasharray=this.#length;
    this.#motion=matchMedia('(prefers-reduced-motion: reduce)');
    this.#motion.addEventListener('change',this.#sync);
    document.addEventListener('visibilitychange',this.#sync);
    this.#render(this.#time);
    this.#sync();
  }

  disconnectedCallback(){
    this.#stop();
    this.#motion?.removeEventListener('change',this.#sync);
    document.removeEventListener('visibilitychange',this.#sync);
  }

  #stop(){
    if(this.#request!==null)cancelAnimationFrame(this.#request);
    this.#request=null;
    this.#last=null;
  }

  #sync=()=>{
    this.#stop();
    const reduced=this.#motion.matches;
    this.#button.disabled=reduced;
    this.#button.setAttribute('aria-label',reduced?'有点想法 Logo':`有点想法，${this.#paused?'继续':'暂停'} Logo 动画`);
    if(reduced){this.dataset.playback='still';this.#render(5500);return;}
    this.#render(this.#time);
    const playing=this.isConnected&&!document.hidden&&!this.#paused;
    this.dataset.playback=playing?'playing':this.#paused?'paused':'hidden';
    if(playing)this.#request=requestAnimationFrame(this.#frame);
  };

  #frame=now=>{
    if(this.#last!==null)this.#time=(this.#time+Math.max(0,now-this.#last))%DURATION;
    this.#last=now;
    this.#render(this.#time);
    this.#request=requestAnimationFrame(this.#frame);
  };

  #render(time){
    const endFade=1-smooth((time-6370)/830);
    this.#groups.forEach(group=>group.style.opacity=endFade);
    this.shadowRoot.getElementById('circuit').style.opacity=endFade;
    entries.forEach((entry,i)=>{
      const remaining=1-easeOut((time-entry.start)/entry.duration);
      const transform=`translate(${(entry.dx*remaining).toFixed(3)} 0)`;
      this.#groups[i].setAttribute('transform',transform);
      if(i===1)this.#cuts[0].setAttribute('transform',transform);
      if(i===2){this.#cuts[1].setAttribute('transform',transform);this.#cuts[2].setAttribute('transform',transform);}
    });
    this.#groups[1].style.opacity=(smooth((time-150)/1200)*endFade).toFixed(4);
    this.#cuts.forEach(cut=>cut.setAttribute('opacity',smooth((time-1130)/830).toFixed(4)));
    const u=clamp((time-2230)/2040),exponent=2.5,endStart=.97;
    let grow=Math.pow(u,exponent);
    if(u>=endStart){
      const d=1-endStart,v=(u-endStart)/d,y0=Math.pow(endStart,exponent),dy0=exponent*Math.pow(endStart,exponent-1);
      grow=(2*v*v*v-3*v*v+1)*y0+(v*v*v-2*v*v+v)*d*dy0+(-2*v*v*v+3*v*v);
    }
    this.#wires.forEach(wire=>wire.style.strokeDashoffset=this.#length*(1-grow));
    for(const node of this.#nodes){
      const scale=smooth((grow-node.threshold)/.065);
      node.el.style.opacity=scale;
      node.el.setAttribute('transform',`translate(${node.x} ${node.y}) scale(${scale}) translate(${-node.x} ${-node.y})`);
    }
  }
}

customElements.define('animated-brand-logo',AnimatedBrandLogo);
