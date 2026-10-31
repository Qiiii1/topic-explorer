import {createGlass} from './vendor/liquid-glass/liquid-glass.js';

// Coloured optics are confined to emphasized icons, outside the native hit target.
const active=new Set(),visible=new Set(),MAX_OPTICS=20;
const reducedTransparency=matchMedia('(prefers-reduced-transparency: reduce), (prefers-contrast: more)');
function refreshOptics(){
  for(const surface of [...active])if(!visible.has(surface)||!surface.isConnected||reducedTransparency.matches)surface.detach();
  if(!reducedTransparency.matches)for(const surface of visible)surface.attach();
}
const viewportObserver=new IntersectionObserver(entries=>{
  for(const entry of entries)entry.isIntersecting&&entry.target.isConnected?visible.add(entry.target):visible.delete(entry.target);
  refreshOptics();
},{rootMargin:'100px'});
class ChromaticGlass extends HTMLElement{
  connectedCallback(){
    this.setAttribute('aria-hidden','true');
    this.texture=document.createElement('span');this.texture.className='chromatic-optic';
    this.replaceChildren(this.texture);
    viewportObserver.observe(this);
  }
  attach(){
    if(this.glass||!this.isConnected||active.size>=MAX_OPTICS||reducedTransparency.matches)return;
    this.glass=createGlass(this.texture,{fit:true,clip:true,radius:22,refraction:8,bezel:.8,curvature:3,chroma:.12,blur:.6,specular:.7,specularWidth:1.6});
    this.setAttribute('data-optical','');
    active.add(this);
  }
  detach(){this.glass?.destroy();this.glass=null;this.removeAttribute('data-optical');active.delete(this);}
  disconnectedCallback(){viewportObserver.unobserve(this);visible.delete(this);this.detach();refreshOptics();}
}
customElements.define('chromatic-glass',ChromaticGlass);
reducedTransparency.addEventListener('change',refreshOptics);

const selector='.idea-card>.node-expand,.idea-card>.card-star,.idea-card>.card-edit';
let frame=0;
function decorate(){
  frame=0;
  document.querySelectorAll(selector).forEach(surface=>{
    if(!surface.querySelector(':scope > chromatic-glass'))surface.prepend(document.createElement('chromatic-glass'));
  });
}
const observer=new MutationObserver(records=>{
  if(!frame&&records.some(record=>[...record.addedNodes].some(node=>node.nodeType===1)))frame=requestAnimationFrame(decorate);
});
for(const root of document.querySelectorAll('#app,#overlays'))observer.observe(root,{childList:true,subtree:true});
decorate();
