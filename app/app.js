import {inspirationStep,inspirationInput} from './inspiration.js';
import { KINDS, CARD, uid, clone, createProject, switchExplorationMode, rootOf, getPaths, ancestorsOf, descendantsOf, appendGenerated, mergeNodes, assignParent, favoriteNode, removeBranch, visibleNodes, boundsOf, validateProject, toMarkdown, planNearbySpace, planGenerationSpace, branchPositions, moveBranch, arrangeByMainline, canCombine, repelCards, spreadCrowdedCards, nodesInRect, selectionExport, importSelection } from './domain.js';
import { demoGenerate } from './demo.js';
import { createBrowserModelClient } from './browser-model.js';
import './vendor/liquid-glass/components.js';
import {wheelIntent,gestureFactor,zoomView} from './canvas-gestures.js';
import {GenerationHistory} from './generation-history.js';
import {SCENE_CATEGORIES,inferSceneCategory,sceneRelations,edgeSceneCategories} from './scene-categories.js';
import {editCard,selectionRelations} from './card-editing.js';

const $=(selector,scope=document)=>scope.querySelector(selector);
const $$=(selector,scope=document)=>[...scope.querySelectorAll(selector)];
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const emoji=symbol=>`<span class="ui-emoji" aria-hidden="true">${esc(symbol)}</span>`;
const icons={branch:'git-branch',search:'search',back:'arrow-left',arrow:'arrow-right',scene:'stack-2',pain:'rocket',people:'users',merge:'git-merge',settings:'world-cog',file:'file-text',save:'device-floppy',refresh:'refresh',layers:'stack-2',link:'arrows-split',tag:'tag',lock:'lock'};
function icon(name,extra=''){
  if(['plus','star','undo','close'].includes(name))return `<img class="source-icon ${extra}" src="./assets/icons/figma-${name}.svg" alt="" aria-hidden="true">`;
  return icons[name]?`<span class="icon ${extra}" aria-hidden="true" style="--icon:url('./assets/icons/${icons[name]}.svg')"></span>`:'';
}
const button=(label,action,options={})=>`<button type="button" class="button ${options.class||''}" data-action="${action}" ${options.id?`data-id="${esc(options.id)}"`:''} ${options.extra||''} ${options.disabled?'disabled':''}>${options.icon?icon(options.icon):''}${label}</button>`;
const iconButton=(label,action,name,options={})=>`<button type="button" class="icon-button ${options.class||''}" data-action="${action}" aria-label="${esc(label)}" title="${esc(label)}" ${options.id?`data-id="${esc(options.id)}"`:''} ${options.extra||''} ${options.disabled?'disabled':''}>${icon(name)||esc(options.symbol||label)}</button>`;
const chip=(kind,label=KINDS[kind].label)=>`<span class="type-chip type-${kind}"><span></span>${label}</span>`;
const actionGlyph=name=>`<svg class="action-glyph" viewBox="0 0 24 24" aria-hidden="true">${name==='undo'?'<path d="m9 5-5 5 5 5M4 10h10a5 5 0 0 1 0 10h-3"/>':name==='minus'?'<path d="M5 12h14"/>':name==='star'?'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>':'<path d="M12 5v14M5 12h14"/>'}</svg>`;
const glassAction=(label,action,options={})=>`<lg-button class="glass-action ${options.class||''} ${options.iconOnly?'glass-icon-action':''}" tone="light" radius="16" refraction="14" backdrop="#surface" data-action="${action}" ${options.iconOnly?`aria-label="${esc(label)}" title="${esc(options.title||label)}"`:''} ${options.id?`data-id="${esc(options.id)}"`:''} ${options.disabled?'disabled':''} ${options.extra||''}>${options.icon?icon(options.icon):options.glyph?actionGlyph(options.glyph):''}${options.iconOnly?'':label}</lg-button>`;
const generations=new GenerationHistory();
const browserModel=document.querySelector('meta[name="topic-runtime"][content="static"]')?createBrowserModelClient():null;
const STORAGE='topic-explorer-projects-v1';
let projects=[];try{projects=JSON.parse(localStorage.getItem(STORAGE)||'[]').flatMap(value=>{try{return [validateProject(value)];}catch{return [];}});}catch{projects=[];}
let p=null,screen='home',selected=null,menu=null,showShelf=false,showOutline=false,focusId=null,showHidden=false,assigning=null,connecting=null,pending=null,search='',query='',editing=null,branchMenu=false,modal=null,model={mode:'unconfigured',model:''},view={x:0,y:0,scale:1},savedSelection=new Set(),savedMultiSelect=false,drag=null,spaceHeld=false;
let lastFocus=null,saveTimer=null,queuedAfterModel=null,fanPinned=null,cordDrag=null,suppressCordClick=false;
let cardMotion=null,layoutAnimation=null,canvasSelection=new Set();
const app=$('#app'),overlays=$('#overlays');

function persist(){
  if(p){p.updatedAt=new Date().toISOString();const index=projects.findIndex(v=>v.id===p.id);if(index<0)projects.unshift(p);else projects[index]=p;}
  try{localStorage.setItem(STORAGE,JSON.stringify(projects));}catch{toast('浏览器存储空间不足，请导出项目文件。','error');}
}
function commit(change){finishCardMotion();change();persist();}
function toast(message,type='success',symbol=''){
  const el=document.createElement('div');el.className=`toast toast-${type}`;
  if(symbol){const decoration=document.createElement('span');decoration.className='ui-emoji';decoration.setAttribute('aria-hidden','true');decoration.textContent=symbol;el.appendChild(decoration);}
  el.appendChild(document.createTextNode(message));$('#toasts').appendChild(el);setTimeout(()=>el.remove(),type==='error'?6000:3600);
}
const isInspiration=()=>p?.explorationMode==='inspiration';
const stageLabel=node=>isInspiration()?(node.kind==='root'?'题目':node.kind==='idea'&&p.nodes.some(parent=>node.parentIds.includes(parent.id)&&parent.kind==='idea')?'子方案':KINDS[node.kind].label):KINDS[node.kind].label;
const generationCount=()=>isInspiration()?inspirationStep(p,current()).count:p.generationCount;
function current(){return p?.nodes.find(n=>n.id===selected)||(p?rootOf(p):null);}
function setCanvasSelection(ids,primary=null){
  const valid=new Set(p?.nodes.map(n=>n.id));canvasSelection=new Set([...ids].filter(id=>valid.has(id)));
  selected=canvasSelection.has(primary)?primary:[...canvasSelection].at(-1)||null;
}
function selectOnly(id){setCanvasSelection(id?[id]:[],id);}
function selectedPaths(){try{return getPaths(p,current().id);}catch{return [];}}
async function api(path,body,signal){
  if(browserModel)return browserModel.request(path,body,signal);
  const response=await fetch('/api'+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal});
  const value=await response.json();if(!response.ok)throw new Error(value.error||'操作未完成，请重试');return value;
}
async function refreshModel(){try{model=await api('/status');if(model.mode==='demo')model.mode='unconfigured';updateModelBadge();}catch{model={mode:'unconfigured',model:''};}}
function updateModelBadge(){const el=$('#model-status');if(el){el.innerHTML=`<span class="status-dot ${model.mode==='live'?'connected':''}"></span><span>${model.mode==='live'?esc(model.model):'连接 AI'}</span>`;el.title='模型设置';}}
function header(){return `<header class="app-header">
  <div class="header-start"><button class="brand" data-action="home" aria-label="有点想法，返回首页"><span class="brand-mark" aria-hidden="true"><img class="brand-logo" src="./assets/brand/logo.svg" alt="" width="44" height="30"></span><span>有点想法<span class="brand-dot">.</span></span></button>
  ${screen==='workspace'?`<span class="header-divider"></span><button class="project-title" data-action="project-settings">${esc(p.title)}<span class="small-chevron">⌄</span></button><span class="autosaved"><span></span>已保存</span>`:''}</div>
  ${screen==='workspace'?`<button class="shelf-pull ${showShelf?'is-open':''}" data-action="shelf" aria-controls="shelf" aria-expanded="${showShelf}" aria-label="${showShelf?'拉起绳子，收起收藏':'拉下绳子，查看收藏'}，${p.favorites.length} 个方向" title="${showShelf?'拉起，收起收藏':'拉一下，查看收藏'}"><img src="./assets/icons/figma-shelf-pull.svg" alt="" aria-hidden="true"><span class="pull-count" ${p.favorites.length?'':'hidden'}>${p.favorites.length}</span></button>`:''}
  <div class="header-actions">${screen==='workspace'?`<label class="search-field">${icon('search')}<input id="node-search" aria-label="搜索节点" placeholder="搜索想法" value="${esc(search)}"></label>${button('导出','export')}${button('分享','share')}`:''}
  <button id="model-status" class="model-status" data-action="model"></button>
  ${screen==='workspace'?iconButton('返回项目首页','home','back'):''}
  </div></header>`;}
function render(){if(screen==='home')renderHome();else renderWorkspace();updateModelBadge();}
function renderHome(){
  screen='home';app.innerHTML=`<main class="home-launcher" aria-label="项目首页"><div class="home-launch-content"><img class="home-brand-logo" src="./assets/brand/logo.svg" alt="有点想法" width="196" height="131"><div class="launch-actions"><button class="launch-button launch-new" data-action="new-project">${emoji('🌱')}<span>新建探索</span></button><button class="launch-button launch-open" data-action="open-projects">${emoji('📂')}<span>打开项目</span></button></div></div></main>`;
}
function renderWorkspace(){
  app.innerHTML=header()+`<main class="workspace ${isInspiration()?'inspiration-workspace':''} ${showShelf?'with-shelf':''} ${showOutline?'with-outline':''}">
    <button class="collection-backdrop ${showShelf?'is-open':''}" data-action="shelf" aria-label="收起收藏栏" tabindex="-1" ${showShelf?'':'inert'}></button>
    <section class="shelf ${showShelf?'is-open':''}" id="shelf" aria-label="收藏的方向" ${showShelf?'':'inert'}></section>
    <section id="surface" class="canvas-surface" aria-label="选题探索画布，拖动空白处框选，按住空格平移" tabindex="0"><div id="world" class="canvas-world"><svg id="edges" class="edges" width="1" height="1"></svg><div id="nodes"></div><svg id="link-preview" class="link-preview" width="1" height="1"></svg><div id="selection-bounds" class="selection-bounds" hidden><i></i><i></i><i></i><i></i></div></div><div id="marquee" class="marquee" hidden></div></section>
    <div id="canvas-selection-bar" class="canvas-selection-bar glass" aria-live="polite" hidden></div>
    <div class="canvas-heading"><span class="eyebrow">${emoji('🧭')} 正在探索</span><span id="node-count"></span></div>
    <aside id="outline" class="outline glass ${showOutline?'is-open':''}" aria-label="探索路径"></aside>
    <aside id="node-panel" class="node-panel glass" aria-label="当前卡片操作" hidden></aside>
    <div id="selection-notice" class="selection-notice glass" hidden></div>
    <section class="manual-dock" aria-label="画布工具栏"><div class="mode-dock" aria-label="探索模式切换"><lg-segmented id="exploration-mode" value="${p.explorationMode==='inspiration'?'inspiration':'organize'}" label="探索模式" refraction="5"><button value="organize">梳理模式</button><button value="inspiration">灵感模式</button></lg-segmented></div><div id="branch-picker" class="branch-picker" hidden></div><lg-panel class="dock-panel" tone="light" radius="26" refraction="20" bezel="0.32" blur="3" chroma="0.12" backdrop="#surface"><div class="dock-toolbar"><div class="canvas-tools" role="group" aria-label="画布操作">${glassAction('撤回生成，Command Z','undo',{glyph:'undo',iconOnly:true,disabled:!generations.canUndo(p)})}${glassAction('恢复生成，Command Shift Z','redo',{glyph:'undo',iconOnly:true,class:'redo-icon',disabled:!generations.canRedo()})}<span class="tool-separator"></span>${glassAction('缩小','zoom-out',{glyph:'minus',iconOnly:true})}${glassAction(Math.round(view.scale*100)+'%','fit',{class:'zoom-value',extra:'id="zoom-value" aria-label="适应画面" title="适应画面"'})}${glassAction('放大','zoom-in',{glyph:'plus',iconOnly:true})}</div><div class="dock-actions"><div class="exploration-tools" role="group" aria-label="探索管理">${glassAction('一键整理','arrange',{icon:'layers',iconOnly:true,title:'按主线整理画布'})}${glassAction(showOutline?'收起探索路径':'探索路径','outline',{icon:'branch',iconOnly:true,extra:`aria-pressed="${showOutline}" aria-controls="outline"`})}</div><div class="branch-tools" role="group" aria-label="分支显示">${glassAction('收起分支','hide-selected',{extra:'aria-label="收起选中卡片及其分支"'})}${glassAction('显示分支','branch-menu',{extra:'aria-expanded="false" aria-controls="branch-picker"'})}${glassAction(focusId?'全部分支':'只看分支','focus-selected',{extra:`aria-pressed="${!!focusId}"`})}</div></div><div class="generation-setting"><span>生成</span><lg-segmented id="generation-count" value="${generationCount()}" label="每次生成数量" refraction="5">${(isInspiration()?[1,3,6,10]:[3,6,10]).map(n=>`<button value="${n}">${n}</button>`).join('')}</lg-segmented><span>张</span></div></div></lg-panel></section>
    <div id="generation-progress" class="generation-progress glass" hidden></div>
  </main>`;
  $$('lg-button[aria-pressed]').forEach(host=>$('button',host)?.setAttribute('aria-pressed',host.getAttribute('aria-pressed')));
  $('#node-search').addEventListener('input',e=>{search=e.target.value;drawGraph();});
  $('#exploration-mode').addEventListener('change',event=>{
    const mode=event.detail.value;
    if(mode===(p.explorationMode||'organize'))return;
    pending?.controller.abort();pending=null;queuedAfterModel=null;
    if(drag)cancelCanvasDrag();
    finishCardMotion();stopLayoutAnimation();
    switchExplorationMode(p,mode);openProject(p);persist();
    toast(mode==='inspiration'?'已进入灵感模式，从题目生成方向。':'已进入梳理模式，从原题重新探索。');
  });
  $('#generation-count').addEventListener('change',event=>{
    if(pending){event.currentTarget.value=String(generationCount());toast('生成完成后即可调整数量。');return;}
    if(isInspiration())p.inspirationCount=Number(event.detail.value);else p.generationCount=Number(event.detail.value);persist();drawGraph();
  });
  bindCanvas();drawGraph();updateModelBadge();
}
function curve(a,b){
  const ax=a.x+CARD.width/2,ay=a.y+CARD.height/2,bx=b.x+CARD.width/2,by=b.y+CARD.height/2;
  if(Math.abs(bx-ax)>120){const sign=bx>=ax?1:-1;const x1=ax+sign*CARD.width/2,x2=bx-sign*CARD.width/2,d=Math.max(90,Math.abs(x2-x1)*0.5);return {d:`M ${x1} ${ay} C ${x1+sign*d} ${ay},${x2-sign*d} ${by},${x2} ${by}`,mx:(x1+x2)/2,my:(ay+by)/2};}
  const sign=by>=ay?1:-1,y1=ay+sign*CARD.height/2,y2=by-sign*CARD.height/2,d=Math.max(70,Math.abs(y2-y1)*0.5);return {d:`M ${ax} ${y1} C ${ax} ${y1+sign*d},${bx} ${y2-sign*d},${bx} ${y2}`,mx:(ax+bx)/2,my:(y1+y2)/2};
}
function graphNodes(){return visibleNodes(p,{focusId,showHidden}).map(n=>pending?.layout?.moves.has(n.id)?{...n,...pending.layout.moves.get(n.id)}:n);}
function paintCanvasSelection(nodes=graphNodes()){
  const visible=new Set(nodes.map(n=>n.id));
  for(const id of canvasSelection)if(!visible.has(id))canvasSelection.delete(id);
  for(const el of $$('.idea-card')){const active=canvasSelection.has(el.dataset.node);el.classList.toggle('is-selected',active);if(el.getAttribute('aria-pressed')!==String(active))el.setAttribute('aria-pressed',String(active));}
  const chosen=nodes.filter(n=>canvasSelection.has(n.id)),box=$('#selection-bounds'),bar=$('#canvas-selection-bar');
  if(box){box.hidden=chosen.length<2;if(!box.hidden){const b=boundsOf(chosen);Object.assign(box.style,{left:b.x-12+'px',top:b.y-12+'px',width:b.width+24+'px',height:b.height+24+'px'});}}
  if(bar){bar.hidden=chosen.length<2||!!connecting||!!assigning;const count=bar.dataset.count;if(count!==String(chosen.length)){bar.dataset.count=chosen.length;bar.innerHTML=`<span>已选 <strong>${chosen.length}</strong> 张</span>${button('导出选中','export-selection')}${button('取消选择','clear-canvas-selection')}`;}}
}
function drawGraph(){
  if(screen!=='workspace'||!p)return;
  stopLayoutAnimation();
  const nodes=graphNodes(),nodeIndex=new Map(nodes.map(n=>[n.id,n])),ids=new Set(nodeIndex.keys());
  setCanvasSelection([...canvasSelection].filter(id=>ids.has(id)),selected);
  const {upstream:ancestors,children}=selectionRelations(p,selected),relations=sceneRelations(p);
  const related=new Set([...ancestors,...children]);
  $('#nodes').innerHTML=nodes.map(n=>{
    const active=canvasSelection.has(n.id),saved=p.favorites.some(f=>f.nodeId===n.id),match=!search||`${n.title} ${n.description}`.toLowerCase().includes(search.toLowerCase());
    const valid=connecting&&canCombine(p.nodes.find(v=>v.id===connecting),n);
    return `<article class="idea-card kind-${n.kind} ${active?'is-selected':''} ${ancestors.has(n.id)&&!active?'is-upstream':''} ${children.has(n.id)?'is-child':''} ${selected&&!related.has(n.id)&&!active?'off-path':''} ${editing?.id===n.id?'is-editing':''} ${n.hidden?'is-hidden':''} ${!match?'search-dim':''} ${connecting?'is-connecting':''} ${connecting===n.id?'connection-source':''} ${valid?'valid-target':''} ${assigning&&descendantsOf(p,assigning).has(n.id)?'invalid-parent':''} ${fanPinned===n.id?'fan-pinned':''} ${menu==='node'&&active?'menu-open':''}" style="left:${n.x}px;top:${n.y}px" data-x="${n.x}" data-y="${n.y}" data-node="${n.id}" role="button" tabindex="0" aria-label="${stageLabel(n)}：${esc(n.title)}${ancestors.has(n.id)&&!active?'，当前方向的上游':children.has(n.id)?'，直接下一级':''}" aria-pressed="${active}">${valid?'<span class="connection-target-label">可组合</span>':''}
      ${isInspiration()?'':`<div class="dimension-deck" role="group" aria-label="为${esc(n.title)}选择细化维度">${['people','pain','scene'].map((kind,i)=>`<button class="dimension-option type-${kind}" style="--fan-index:${i}" data-action="expand" data-kind="${kind}" data-id="${n.id}" aria-label="从${KINDS[kind].label}细化：${esc(n.title)}"><span class="dimension-dot"></span><strong>${KINDS[kind].label}</strong><span class="dimension-count">${p.generationCount} 张</span>${icon('arrow')}</button>`).join('')}</div>`}<button class="card-edit" data-action="edit" data-id="${n.id}" aria-label="编辑卡片：${esc(n.title)}" title="编辑内容"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15l-1 6Z"/></svg></button><div class="card-surface"><div class="card-top">${n.kind==='root'?'<span class="type-chip type-root"><span></span>主选题</span>':chip(n.kind,stageLabel(n))}${n.merged?'<span class="merge-tag" title="来自两个想法的交集">∩</span>':''}</div>${editing?.id===n.id?inlineEditorMarkup(n):`<h3>${esc(n.title)}</h3>${isInspiration()&&n.kind!=='root'?`<p class="inspiration-summary">${esc(n.description)}</p>`:''}`}<button class="card-more" data-action="node-menu" data-id="${n.id}" aria-label="卡片操作：${esc(n.title)}">···</button></div><button class="node-expand" data-action="expand-same" data-id="${n.id}" aria-label="${isInspiration()?inspirationStep(p,n).label:n.kind==='root'?'展开选题维度':'继续细化'}：${esc(n.title)}">${actionGlyph('plus')}</button>${n.kind!=='root'?`<button class="card-star ${saved?'is-saved':''}" data-action="favorite" data-id="${n.id}" aria-label="${saved?'取消收藏':'收藏完整路径'}：${esc(n.title)}" aria-pressed="${saved}">${actionGlyph('star')}</button>`:''}<span class="selection-corner" aria-hidden="true">✓</span>${!isInspiration()&&n.kind!=='root'?`<button class="connection-handle handle-right" data-handle="${n.id}" aria-label="拖动加号连接同类卡片：${esc(n.title)}" title="组合卡片"><span aria-hidden="true">+</span></button>`:''}</article>`;
  }).join('')+pendingCardMarkup();
  const edgeActive=edge=>ancestors.has(edge.from)&&ancestors.has(edge.to)||edge.from===selected&&children.has(edge.to);
  const sceneDefs=Object.entries(SCENE_CATEGORIES).map(([id,category])=>`<marker id="path-arrow-${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="10" markerHeight="10" orient="auto" markerUnits="userSpaceOnUse"><path d="M 1 1 L 9 5 L 1 9 Z" fill="${category.color}"/></marker>`).join('');
  $('#edges').innerHTML='<defs>'+sceneDefs+'</defs>'+p.edges.filter(e=>ids.has(e.from)&&ids.has(e.to)).sort((a,b)=>Number(edgeActive(a))-Number(edgeActive(b))).map(e=>{
    const a=nodeIndex.get(e.from),b=nodeIndex.get(e.to),c=curve(a,b),active=edgeActive(e),child=e.from===selected&&children.has(e.to),categories=edgeSceneCategories(p,e,relations),category=categories[0]||'other',color=SCENE_CATEGORIES[category].color,label=e.merged?'共同点 / 交集':e.relation;
    return `<g class="edge-group ${active?'is-active':''} ${child?'is-child-edge':''} ${selected&&!active?'is-muted':''} ${e.merged?'merged-edge':''}" style="--path-color:${color}" data-scene-category="${category}" data-edge="${e.id}" role="button" tabindex="0" aria-label="${categories.map(id=>SCENE_CATEGORIES[id].label).join('、')}，查看关联：${esc(a.title)}到${esc(b.title)}">${active?`<path class="edge-halo" d="${c.d}"></path>`:''}<path class="edge-line" d="${c.d}" ${active?`marker-end="url(#path-arrow-${category})"`:''}></path>${active?`<path class="edge-flow" d="${c.d}"></path>`:''}<path class="edge-hit" d="${c.d}"></path><g class="edge-label" transform="translate(${c.mx},${c.my})"><rect x="-51" y="-13" width="102" height="26" rx="13"></rect><text y="4" text-anchor="middle">${esc(label)}</text></g></g>`;
  }).join('')+pendingEdgesMarkup();
  bindInlineEditor();drawBranchControls();
  updateView();drawShelf();drawOutline();drawNodePanel();updateNotices();paintCanvasSelection();
  $('#node-count').textContent=`${p.nodes.length} 个想法${focusId?' · 正在聚焦一条分支':''}`;
  if(search){const matches=nodes.filter(n=>`${n.title} ${n.description}`.toLowerCase().includes(search.toLowerCase()));$('#node-count').textContent=matches.length?`找到 ${matches.length} 个相关想法`:'没有找到相关想法';}
  const undo=$('[data-action="undo"]'),redo=$('[data-action="redo"]');
  undo?.toggleAttribute('disabled',!generations.canUndo(p));redo?.toggleAttribute('disabled',!generations.canRedo());
  if(isInspiration())$('#generation-count').value=String(generationCount());
  updatePull();
}
function pendingCardMarkup(){
  if(!pending?.positions?.length)return '';
  const pos=pending.positions[0];
  return `<article class="loading-card type-${pending.kind}" style="left:${pos.x}px;top:${pos.y}px" role="status" aria-live="polite" aria-busy="true"><div class="loading-top"><span class="skeleton-orb"></span><span class="skeleton-line skeleton-heading"></span></div><div class="loading-lines" aria-hidden="true"><span class="skeleton-line"></span><span class="skeleton-line"></span></div><div class="loading-caption"><span class="loading-word">${pending.operation==='merge'?'寻找交集中':'生成'+(pending.stageLabel||KINDS[pending.kind].label)+'中'}</span><span class="loading-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="loading-count">${pending.count} 张</span></div></article>`;
}
function pendingEdgesMarkup(){
  if(!pending?.positions?.length)return '';
  return pending.sourceIds.map(id=>{const source=graphNodes().find(n=>n.id===id);return source?`<path class="pending-connector" d="${curve(source,pending.positions[0]).d}"/>`:'';}).join('');
}
function revealCards(nodes){
  const world=$('#world'),before=getComputedStyle(world).transform;
  fitView(nodes,true);
  world.animate([{transform:before},{transform:world.style.transform}],{duration:motionDuration(500),easing:'cubic-bezier(.2,.8,.2,1)'});
}
function stopLayoutAnimation(){
  if(!layoutAnimation)return;
  cancelAnimationFrame(layoutAnimation.frame);layoutAnimation=null;
  $$('.idea-card').forEach(el=>el.style.removeProperty('translate'));
  $('#surface')?.classList.remove('is-arranging');
  if(p&&$('#edges'))updateEdgePositions();
}
function animateLayout(before){
  stopLayoutAnimation();
  if(!motionDuration(420))return;
  const origins=new Map(before.map(n=>[n.id,n])),targets=graphNodes().map(n=>({...n}));
  const state={start:performance.now(),projectId:p.id};layoutAnimation=state;
  $('#surface').classList.add('is-arranging');
  const tick=now=>{
    if(layoutAnimation!==state||p?.id!==state.projectId)return;
    const t=Math.min(1,(now-state.start)/420),ease=1-(1-t)**3;
    paintCardPositions(targets.map(n=>{const from=origins.get(n.id)||n;return {...n,x:from.x+(n.x-from.x)*ease,y:from.y+(n.y-from.y)*ease};}));
    if(t<1)state.frame=requestAnimationFrame(tick);else stopLayoutAnimation();
  };
  tick(state.start);
}
function animateCreated(nodes,anchor){
  nodes.forEach((n,i)=>{
    const el=$(`[data-node="${n.id}"]`);if(!el)return;
    el.animate([{opacity:0,transform:`translate(${i?(anchor.x-n.x)*0.2:0}px,${i?(anchor.y-n.y)*0.2:8}px) scale(.94)`},{opacity:1,transform:'translate(0,0) scale(1)'}],{duration:motionDuration(520),delay:motionDuration(i*45),easing:'cubic-bezier(.18,.85,.25,1.12)',fill:'backwards'});
  });
}
function updateView(){
  const world=$('#world');if(world)world.style.transform=`translate(${view.x}px,${view.y}px) scale(${view.scale})`;
  const z=$('#zoom-value .lg-button__label');if(z)z.textContent=Math.round(view.scale*100)+'%';
}
function fitView(nodes=null,overview=false){
  const surface=$('#surface');if(!surface)return;const r=surface.getBoundingClientRect(),b=boundsOf(nodes||visibleNodes(p,{focusId,showHidden}));
  const dock=$('.manual-dock').getBoundingClientRect();
  const top=64+(showShelf?258:0),bottom=Math.max(112,r.bottom-dock.top+24),left=showOutline?270:38,right=38;
  const scale=Math.min(1.05,Math.max(overview?0.08:0.75,Math.min((r.width-left-right)/(b.width+55),(r.height-top-bottom)/(b.height+45))));
  view={scale,x:left+(r.width-left-right)/2-(b.x+b.width/2)*scale,y:top+(r.height-top-bottom)/2-(b.y+b.height/2)*scale};updateView();
}
function centerNode(id){const n=p.nodes.find(v=>v.id===id),r=$('#surface').getBoundingClientRect();if(!n)return;view.x=r.width/2-(n.x+CARD.width/2)*view.scale;view.y=(r.height-100)/2-(n.y+CARD.height/2)*view.scale;updateView();}
function zoomBy(factor,point=null){const r=$('#surface').getBoundingClientRect();view=zoomView(view,factor,point||{x:r.width/2,y:r.height/2});updateView();}
function drawNodePanel(){
  const panel=$('#node-panel');if(!panel)return;
  if(!fanPinned)$$('.idea-card.fan-pinned').forEach(el=>el.classList.remove('fan-pinned'));
  if(menu!=='node'||!selected||canvasSelection.size>1){panel.hidden=true;$$('.idea-card.menu-open').forEach(el=>el.classList.remove('menu-open'));return;}
  const n=current();panel.hidden=false;panel.innerHTML=`<div class="panel-heading"><span class="eyebrow">${stageLabel(n)}</span>${iconButton('关闭卡片操作','close-menu','',{symbol:'×'})}</div><h2>${esc(n.title)}</h2><p class="panel-description">${esc(n.description)}</p><div class="panel-reason"><span>与上层的关联</span><p>${esc(n.rationale)}</p></div><div class="panel-secondary">${button('编辑内容与理由','edit',{id:n.id})}${button('完整路径','details',{id:n.id})}${!isInspiration()&&n.kind!=='root'?button('指定上层','assign',{id:n.id}):''}${!isInspiration()&&n.kind!=='root'?button('关联同类卡片','connect',{id:n.id}):''}</div>${n.kind!=='root'?`<div class="panel-bottom">${button('删除','delete-node',{id:n.id,class:'danger-text'})}</div>`:''}`;
}
function updatePull(){
  const pull=$('.shelf-pull');if(!pull||!p)return;
  pull.classList.toggle('is-open',showShelf);pull.setAttribute('aria-expanded',String(showShelf));
  pull.setAttribute('aria-label',`${showShelf?'拉起绳子，收起收藏':'拉下绳子，查看收藏'}，${p.favorites.length} 个方向`);
  pull.title=showShelf?'拉起，收起收藏':'拉一下，查看收藏';
  const count=$('.pull-count',pull);count.textContent=p.favorites.length;count.hidden=!p.favorites.length;
  const workspace=$('.workspace');if(workspace)for(const child of workspace.children)if(child.id!=='shelf'&&!child.classList.contains('collection-backdrop'))child.inert=showShelf;
}
function toggleShelf(){
  showShelf=!showShelf;savedSelection.clear();savedMultiSelect=false;fanPinned=null;menu=null;
  $('.workspace')?.classList.toggle('with-shelf',showShelf);
  const backdrop=$('.collection-backdrop');backdrop?.classList.toggle('is-open',showShelf);if(backdrop)backdrop.inert=!showShelf;
  const shelf=$('#shelf');shelf?.classList.toggle('is-open',showShelf);if(shelf)shelf.inert=!showShelf;
  updatePull();drawShelf();drawNodePanel();
}
function drawShelf(){
  const shelf=$('#shelf');if(!shelf)return;
  for(const id of savedSelection)if(!p.favorites.some(f=>f.id===id))savedSelection.delete(id);
  if(!p.favorites.length)savedMultiSelect=false;
  shelf.innerHTML=`<div class="shelf-heading"><div><h2>${emoji('⭐')} 收藏的方向 <span>${p.favorites.length}</span></h2></div><div>${savedSelection.size?button('导出选中 '+savedSelection.size+' 项','export-saved'):''}${p.favorites.length?button(savedMultiSelect?'完成':'选择导出','saved-select-mode',{extra:`aria-pressed="${savedMultiSelect}"`}):''}</div></div><div class="shelf-rope"></div><div class="saved-cards">${p.favorites.length?p.favorites.map((f,i)=>`<article class="saved-card type-${f.kind}" data-saved-card="${f.id}" style="--turn:${[-1.2,1,-.6,.8][i%4]}deg;--hang-delay:${i*35}ms"><button class="saved-favorite" data-action="remove-saved" data-id="${f.id}" aria-label="取消收藏：${esc(f.title)}" aria-pressed="true" title="取消收藏">${actionGlyph('star')}</button>${savedMultiSelect?`<label class="saved-export-check"><input type="checkbox" data-saved-check="${f.id}" ${savedSelection.has(f.id)?'checked':''} aria-label="选择导出：${esc(f.title)}"><span>选择导出</span></label>`:''}<button class="saved-card-open" data-action="saved-detail" data-id="${f.id}"><span class="saved-kicker">${KINDS[f.kind].label}</span><h3>${esc(f.title)}</h3><p>${esc(f.description)}</p></button></article>`).join(''):'<div class="shelf-empty">还没有收藏</div>'}</div>`;
}
function drawOutline(){
  const el=$('#outline');if(!el)return;
  const visible=new Set(graphNodes().map(node=>node.id)),index=new Map(p.nodes.map(node=>[node.id,node]));
  const groups=isInspiration()?[{kind:'direction',label:'方向',color:'var(--direction)'},{kind:'idea',label:'方案与子方案',color:'var(--idea)'}]:[{kind:'scene',label:'场景',color:'var(--scene)'},{kind:'people',label:'人物',color:'var(--people)'},{kind:'pain',label:'痛点',color:'var(--pain)'}];
  el.innerHTML=`<div class="outline-heading"><span>探索路径</span>${iconButton('收起探索路径','outline','',{symbol:'×'})}</div><div class="outline-root">${button(esc(rootOf(p).title),'locate',{id:rootOf(p).id})}</div>${groups.map(({kind,label,color})=>{
    const members=p.nodes.filter(node=>node.kind===kind);
    return `<section class="outline-kind-group" data-outline-kind="${kind}" style="--path-color:${color}"><h3><span class="scene-swatch"></span>${label}<span>${members.length}</span></h3>${members.map(node=>{
      const parents=node.parentIds.map(id=>index.get(id)?.title).filter(Boolean),origin=parents.length?'来自 '+parents.join(' / '):'独立卡片';
      return `<div class="outline-item ${node.id===selected?'selected':''} ${visible.has(node.id)?'':'outline-hidden'}" style="--depth:0"><button data-action="locate" data-id="${node.id}" title="${esc(origin)}"><span class="outline-dot" style="background:${color}"></span><span><small>${esc(origin)}${visible.has(node.id)?'':' · 已收起'}</small>${esc(node.title)}</span>${node.merged?'<span class="outline-merge">∩</span>':''}</button></div>`;
    }).join('')}</section>`;
  }).join('')}`;
}
function drawBranchControls(){
  const hidden=p.nodes.filter(node=>node.hidden),hide=$('[data-action="hide-selected"]'),show=$('[data-action="branch-menu"]'),focus=$('[data-action="focus-selected"]');
  const blocked=!!pending||!!editing;
  hide?.toggleAttribute('disabled',blocked||!selected||current()?.kind==='root'||canvasSelection.size!==1);
  show?.toggleAttribute('disabled',blocked||!hidden.length);
  show?.setAttribute('aria-expanded',String(branchMenu&&hidden.length>0));
  $('button',show)?.setAttribute('aria-expanded',String(branchMenu&&hidden.length>0));
  focus?.toggleAttribute('disabled',blocked||!focusId&&(!selected||current()?.kind==='root'||canvasSelection.size!==1));
  const picker=$('#branch-picker');if(!picker)return;
  picker.hidden=!branchMenu||!hidden.length;
  picker.innerHTML=`<div class="branch-picker-heading"><strong>已收起的分支</strong>${button('全部显示','restore-all')}</div>${hidden.map(node=>`<button class="branch-restore" data-action="restore-branch" data-id="${node.id}"><span>${chip(node.kind)}<strong>${esc(node.title)}</strong></span><span>显示 ↗</span></button>`).join('')}`;
}
function inlineEditorMarkup(node){
  return `<form class="inline-editor" data-editor="${node.id}" novalidate><label><span>${node.kind==='root'?'最初想探索的内容':'卡片内容'}</span><textarea name="title" rows="3" maxlength="${node.kind==='root'?2000:90}" required aria-describedby="card-edit-error">${esc(editing.title)}</textarea></label>${node.kind!=='root'?`<label><span>补充描述</span><textarea name="description" rows="2" maxlength="1600">${esc(editing.description)}</textarea></label>`:''}${node.kind==='scene'?`<label><span>场景类别</span><select name="sceneCategory">${Object.entries(SCENE_CATEGORIES).map(([id,category])=>`<option value="${id}" ${editing.sceneCategory===id?'selected':''}>${category.label}</option>`).join('')}</select></label>`:''}<label><span>与上层的关联</span><textarea name="rationale" rows="2" maxlength="1600">${esc(editing.rationale)}</textarea></label><p id="card-edit-error" class="inline-edit-error" role="alert" hidden></p><div class="inline-edit-actions">${button('取消','cancel-edit')}<button type="submit" class="button primary">保存</button></div></form>`;
}
function bindInlineEditor(){
  const form=$('[data-editor]');if(!form)return;
  form.addEventListener('input',event=>{if(editing&&event.target.name)editing[event.target.name]=event.target.value;});
  form.addEventListener('change',event=>{if(editing&&event.target.name)editing[event.target.name]=event.target.value;});
  form.addEventListener('submit',event=>{event.preventDefault();saveInlineEdit();});
}
function beginInlineEdit(id){
  if(pending)return toast('生成完成后即可编辑。');
  if(editing?.id===id){$('[data-editor] textarea')?.focus({preventScroll:true});return;}
  if(editing&&editing.id!==id&&!saveInlineEdit())return;
  const node=p.nodes.find(value=>value.id===id);if(!node)return;
  editing={id,title:node.kind==='root'?node.description||node.title:node.title,description:node.description||'',rationale:node.rationale||'',sceneCategory:inferSceneCategory(node)};
  selectOnly(id);fanPinned=null;menu=null;branchMenu=false;connecting=null;assigning=null;drawGraph();
  positionInlineEditor();
  $('[data-editor] textarea')?.focus({preventScroll:true});
}
function positionInlineEditor(){
  const node=p?.nodes.find(value=>value.id===editing?.id),card=$('.idea-card.is-editing'),surface=$('#surface');
  if(!node||!card||!surface)return;
  const rect=surface.getBoundingClientRect(),dock=$('.manual-dock').getBoundingClientRect(),width=card.offsetWidth,height=card.offsetHeight;
  view.scale=Math.min(1,Math.max(.55,Math.min((rect.width-32)/width,(dock.top-rect.top-90)/height)));
  view.x=(rect.width-width*view.scale)/2-node.x*view.scale;
  view.y=Math.max(64,(dock.top-rect.top-height*view.scale)/2)-node.y*view.scale;updateView();
}
function saveInlineEdit(){
  if(!editing)return true;
  const draft=editing,id=draft.id;
  try{commit(()=>editCard(p,id,draft));editing=null;drawGraph();$(`[data-node="${id}"]`)?.focus({preventScroll:true});return true;}
  catch(error){const el=$('#card-edit-error');if(el){el.textContent=error.message;el.hidden=false;$('[data-editor] textarea')?.setAttribute('aria-invalid','true');$('[data-editor] textarea')?.focus({preventScroll:true});}return false;}
}
function updateNotices(){
  const notice=$('#selection-notice'),progress=$('#generation-progress');
  if(!notice||!progress)return;
  if(assigning||connecting){notice.hidden=false;const n=p.nodes.find(v=>v.id===(assigning||connecting));notice.innerHTML=`<span>${assigning?`为“${esc(n?.title)}”选择上层节点`:`为“${esc(n?.title)}”选择另一张${KINDS[n?.kind]?.label||''}卡片，提取交集`}</span>${button('取消','cancel-selection')}`;}else notice.hidden=true;
  if(pending){progress.hidden=false;progress.innerHTML=`<span class="spinner"></span><span>${esc(pending.label)}</span>${button('取消','cancel-generation')}`;}else progress.hidden=true;
}
function openProject(project){
  finishCardMotion();
  pending?.controller.abort();pending=null;p=project;screen='workspace';selectOnly(rootOf(p).id);menu=null;fanPinned=null;focusId=null;showShelf=false;showOutline=false;showHidden=false;generations.clear();search='';assigning=null;connecting=null;editing=null;branchMenu=false;savedSelection.clear();savedMultiSelect=false;
  if(spreadCrowdedCards(p.nodes,new Set([rootOf(p).id])).size)persist();
  render();requestAnimationFrame(()=>fitView(null,true));
}
function openDemo(){
  let project=projects.find(v=>v.isExample);if(!project){
    project=createProject('探索人与城市之间的日常关系，寻找让公共空间更有余地的交互体验。','人与城市的日常');project.isExample=true;
    const root=rootOf(project),scenes=appendGenerated(project,root.id,'scene',demoGenerate({operation:'expand',project,node:root,targetKind:'scene',count:3}).nodes,'demo');
    scenes[0].title='下班后的社区';scenes[0].description='回家之前，想多停留一会儿。';scenes[0].rationale='从城市的日常关系，聚焦到一天结束后可被观察的具体时刻。';
    Object.assign(scenes[0],{x:-350,y:-40});Object.assign(scenes[1],{x:350,y:-140});Object.assign(scenes[2],{x:350,y:170});
    const pains=appendGenerated(project,scenes[0].id,'pain',demoGenerate({operation:'expand',project,node:scenes[0],targetKind:'pain',count:3}).nodes.slice(0,2),'demo');
    Object.assign(pains[0],{x:-700,y:-180});Object.assign(pains[1],{x:-700,y:95});pains[0].rationale='留意停留时的社交边界：想感受周围人的存在，也希望保留独处的自由。';
    projects.unshift(project);p=project;persist();
  }
  openProject(project);selectOnly((project.nodes.find(n=>n.kind==='scene')||rootOf(project)).id);drawGraph();
}
async function generate(parentId,kind){
  if(editing&&!saveInlineEdit())return;
  if(pending)return toast('请等待这次生成完成，或先取消。');
  if(model.mode!=='live'){queuedAfterModel=()=>generate(parentId,kind);openModal('model');return;}
  const node=p.nodes.find(n=>n.id===parentId);if(!node)return;
  const inspiration=isInspiration()?inspirationInput(p,node):null;
  if(inspiration)kind=inspiration.targetKind;
  finishCardMotion();
  const before=clone(p.nodes);
  const projectId=p.id,count=inspiration?.count??p.generationCount,controller=new AbortController(),layout=planGenerationSpace(p,parentId,count),positions=layout.positions;
  pending={controller,viewBefore:{...view},operation:inspiration?'inspire':'expand',stageLabel:inspiration?.action==='evolve_idea'?'子方案':KINDS[kind].label,kind,count,positions,layout,sourceIds:[parentId],label:`沿着“${node.title.slice(0,18)}”生成 ${count} 张${KINDS[kind].label}…`};menu=null;fanPinned=null;selectOnly(parentId);drawGraph();animateLayout(before);revealCards([layout.anchor,...positions]);
  try{
    const result=await api('/generate',inspiration||{operation:'expand',project:{title:p.title,description:p.description,context:p.context},node,ancestors:ancestorsOf(p,node.id),targetKind:kind,count,exclude:p.nodes.filter(n=>n.parentIds.includes(node.id)&&n.kind===kind).map(n=>n.title)},controller.signal);
    if(controller.signal.aborted||p?.id!==projectId)return;
    if(!result.nodes.length)throw new Error(result.message||'模型没有给出可用候选，可以调整条件后重试。');
    if(!p.nodes.some(n=>n.id===parentId))throw new Error('来源卡片已被移除，这次结果没有加入画布。');
    pending=null;let created;commit(()=>{created=appendGenerated(p,parentId,kind,result.nodes,'live',layout);generations.record(created);});selectOnly(created[0].id);menu=null;drawGraph();revealCards([node,...created]);animateCreated(created,node);toast(`已生成 ${created.length} 张${stageLabel(created[0])}卡片`);if(result.message)toast(result.message);
  }catch(error){if(error.name!=='AbortError')toast(error.message,'error');}finally{if(pending?.controller===controller)clearPending();updateNotices();}
}
async function combine(aId,bId){
  if(editing&&!saveInlineEdit())return;
  if(pending)return toast('请等待这次生成完成，或先取消。');
  const a=p.nodes.find(n=>n.id===aId),b=p.nodes.find(n=>n.id===bId);
  if(!canCombine(a,b))return toast('只能关联两张不同的同类卡片。','error');
  connecting=null;assigning=null;
  if(model.mode!=='live'){queuedAfterModel=()=>combine(aId,bId);openModal('model');drawGraph();return;}
  finishCardMotion();
  const before=clone(p.nodes),protectedIds=new Set([...ancestorsOf(p,aId),...ancestorsOf(p,bId)].map(n=>n.id));
  const projectId=p.id,controller=new AbortController(),layout=planNearbySpace(p.nodes,{x:(a.x+b.x)/2,y:(a.y+b.y)/2},1,protectedIds),positions=layout.positions;
  pending={controller,viewBefore:{...view},operation:'merge',kind:a.kind,count:1,positions,layout,sourceIds:[aId,bId],label:'正在提取两张卡片的共同点或交集…'};drawGraph();animateLayout(before);revealCards([a,b,...positions]);
  try{
    const result=await api('/generate',{operation:'merge',project:{title:p.title,description:p.description,context:p.context},nodes:[a,b],ancestors:[ancestorsOf(p,aId),ancestorsOf(p,bId)]},controller.signal);
    if(controller.signal.aborted||p?.id!==projectId)return;
    if(!result.nodes.length){toast(result.message||'没有找到合理交集，原卡片已保留。');return;}
    if(![aId,bId].every(id=>p.nodes.some(n=>n.id===id)))throw new Error('来源卡片已被移除，这次结果没有加入画布。');
    pending=null;let node;commit(()=>{node=mergeNodes(p,aId,bId,result.nodes[0],'live',positions[0]);generations.record([node]);});selectOnly(node.id);drawGraph();revealCards(ancestorsOf(p,node.id));animateCreated([node],positions[0]);toast('已生成交集卡片');
  }catch(error){if(error.name!=='AbortError')toast(error.message,'error');}finally{if(pending?.controller===controller)clearPending();updateNotices();}
}
function clearPending(){const before=graphNodes().map(n=>({...n})),previousView=pending?.viewBefore,world=$('#world'),transform=world&&getComputedStyle(world).transform;pending=null;if(previousView)view=previousView;drawGraph();animateLayout(before);if(world&&transform)world.animate([{transform},{transform:world.style.transform}],{duration:motionDuration(420),easing:'cubic-bezier(.2,.8,.2,1)'});}
function selectNode(id,additive=false){
  finishCardMotion();
  if(editing&&editing.id!==id&&!saveInlineEdit())return;
  const node=p.nodes.find(n=>n.id===id);if(!node)return;
  if(assigning){try{const moving=assigning;commit(()=>assignParent(p,moving,id));assigning=null;selectOnly(moving);menu=null;drawGraph();toast('已指定上层');}catch(e){toast(e.message,'error');}return;}
  if(connecting){if(connecting===id)return;combine(connecting,id);return;}
  if(additive){const next=new Set(canvasSelection);next.has(id)?next.delete(id):next.add(id);setCanvasSelection(next,id);}else selectOnly(id);
  menu=null;fanPinned=canvasSelection.size===1&&matchMedia('(hover: none)').matches?id:null;drawGraph();$(`[data-node="${id}"]`)?.focus({preventScroll:true});
}
function paintCardPositions(nodes){
  for(const n of nodes){const el=$(`[data-node="${n.id}"]`);if(el)el.style.translate=`${n.x-Number(el.dataset.x)}px ${n.y-Number(el.dataset.y)}px`;}
  updateEdgePositions(nodes);
  paintCanvasSelection(nodes);
}
function finishCardMotion(record=true){
  const motion=cardMotion;if(!motion)return;
  cardMotion=null;cancelAnimationFrame(motion.frame);
  if(drag?.type==='node')drag=null;
  $('#surface')?.classList.remove('is-dragging-card');
  if(p?.id===motion.projectId&&record)persist();
}
function startCardMotion(before,id,fixedIds){
  cardMotion={before,fixedId:id,fixedIds,projectId:p.id,nodes:visibleNodes(p,{focusId,showHidden}),activeIds:new Set(fixedIds),released:false,settleFrames:0};
  $('#surface').classList.add('is-dragging-card');
  function tick(){
    const motion=cardMotion;if(!motion||p?.id!==motion.projectId)return;
    const moved=repelCards(motion.nodes,motion.fixedId,{activeIds:motion.activeIds,fixedIds:motion.fixedIds,gap:112});
    paintCardPositions(motion.nodes);
    if(motion.released&&(!moved.size||++motion.settleFrames>100)){finishCardMotion();drawGraph();return;}
    motion.frame=requestAnimationFrame(tick);
  }
  cardMotion.frame=requestAnimationFrame(tick);
}
function bindCanvas(){
  const surface=$('#surface');
  let pinchScale=null;
  const gesturePoint=(event,rect)=>event.clientX||event.clientY?{x:event.clientX-rect.left,y:event.clientY-rect.top}:{x:rect.width/2,y:rect.height/2};
  surface.addEventListener('wheel',event=>{
    if(event.target.closest('textarea,input,select'))return;
    event.preventDefault();if(drag||pinchScale!==null)return;
    const rect=surface.getBoundingClientRect(),intent=wheelIntent(event,rect);
    if(intent.type==='zoom')zoomBy(intent.factor,gesturePoint(event,rect));
    else{view.x-=intent.dx;view.y-=intent.dy;updateView();}
  },{passive:false});
  surface.addEventListener('gesturestart',event=>{event.preventDefault();if(!drag)pinchScale=event.scale||1;},{passive:false});
  surface.addEventListener('gesturechange',event=>{
    event.preventDefault();if(pinchScale===null||drag)return;
    const rect=surface.getBoundingClientRect();zoomBy(gestureFactor(event.scale,pinchScale,rect),gesturePoint(event,rect));
    if(Number.isFinite(event.scale)&&event.scale>0)pinchScale=event.scale;
  },{passive:false});
  surface.addEventListener('gestureend',event=>{event.preventDefault();pinchScale=null;},{passive:false});
  surface.addEventListener('pointerdown',event=>{
    if(event.target.closest('input,textarea,select,form'))return;
    if(event.button!==0&&event.button!==1)return;
    const handle=event.target.closest('[data-handle]'),nodeEl=event.target.closest('[data-node]');
    if(pending&&(handle||nodeEl)&&!event.target.closest('button[data-action]'))return;
    if(handle){finishCardMotion();event.preventDefault();event.stopPropagation();connecting=handle.dataset.handle;assigning=null;fanPinned=null;menu=null;drag={type:'link',id:connecting,startX:event.clientX,startY:event.clientY,moved:false};surface.setPointerCapture(event.pointerId);drawGraph();return;}
    if(event.target.closest('button,[data-edge]')&&!spaceHeld)return;
    finishCardMotion();
    stopLayoutAnimation();
    if(nodeEl&&!spaceHeld&&event.button!==1){
      const n=p.nodes.find(v=>v.id===nodeEl.dataset.node),selection=event.shiftKey?new Set([...canvasSelection,n.id]):canvasSelection.has(n.id)?new Set(canvasSelection):new Set([n.id]);
      drag={type:connecting||assigning?'pick':'node',id:n.id,startX:event.clientX,startY:event.clientY,origins:branchPositions(p,[...selection]),selection,oldSelection:new Set(canvasSelection),additive:event.shiftKey,moved:false,before:clone(p)};
    }else if(spaceHeld||event.button===1){drag={type:'pan',startX:event.clientX,startY:event.clientY,x:view.x,y:view.y,moved:false};surface.classList.add('is-panning');}
    else{
      const rect=surface.getBoundingClientRect();menu=null;fanPinned=null;branchMenu=false;drawBranchControls();drawNodePanel();
      drag={type:'marquee',startX:event.clientX,startY:event.clientY,rect,base:event.shiftKey?new Set(canvasSelection):new Set(),oldSelection:new Set(canvasSelection),moved:false};surface.classList.add('is-marquee');
      surface.focus({preventScroll:true});
    }
    event.preventDefault();
    surface.setPointerCapture(event.pointerId);
  });

}
document.addEventListener('pointerdown',event=>{
  const pull=event.target.closest('.shelf-pull');if(!pull||event.button!==0)return;
  cordDrag={startY:event.clientY,wasOpen:showShelf,pull};pull.setPointerCapture(event.pointerId);
});
document.addEventListener('pointermove',event=>{
  if(cordDrag){const delta=event.clientY-cordDrag.startY;if(Math.abs(delta)>5){cordDrag.pull.classList.add('is-dragging');cordDrag.pull.style.setProperty('--cord-offset',Math.max(-30,Math.min(30,delta))+'px');}return;}
  if(!drag)return;const dx=event.clientX-drag.startX,dy=event.clientY-drag.startY;if(Math.hypot(dx,dy)>4)drag.moved=true;
  if(drag.type==='pan'){view.x=drag.x+dx;view.y=drag.y+dy;updateView();}
  if(drag.type==='marquee'&&drag.moved){
    const left=Math.min(drag.startX,event.clientX)-drag.rect.left,top=Math.min(drag.startY,event.clientY)-drag.rect.top,width=Math.abs(dx),height=Math.abs(dy),box=$('#marquee');
    box.hidden=false;Object.assign(box.style,{left:left+'px',top:top+'px',width:width+'px',height:height+'px'});
    const hits=nodesInRect(graphNodes(),{x:(left-view.x)/view.scale,y:(top-view.y)/view.scale,width:width/view.scale,height:height/view.scale});
    setCanvasSelection(new Set([...drag.base,...hits]));paintCanvasSelection();
  }
  if(drag.type==='node'&&drag.moved){
    if(!cardMotion){setCanvasSelection(drag.selection,drag.id);fanPinned=null;menu=null;drawGraph();startCardMotion(drag.before,drag.id,new Set(drag.origins.keys()));}
    moveBranch(p,drag.origins,dx/view.scale,dy/view.scale);paintCardPositions(cardMotion.nodes);
  }
  if(drag.type==='link'){
    const n=p.nodes.find(v=>v.id===drag.id),rect=$('#surface').getBoundingClientRect(),x=(event.clientX-rect.left-view.x)/view.scale,y=(event.clientY-rect.top-view.y)/view.scale;
    const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-node]'),candidate=p.nodes.find(v=>v.id===target?.dataset.node),valid=canCombine(n,candidate);
    $$('.idea-card.drop-target').forEach(el=>el.classList.remove('drop-target'));if(valid)target.classList.add('drop-target');
    const startX=n.x+CARD.width+28;
    $('#link-preview').innerHTML=`<path d="M ${startX} ${n.y+CARD.height/2} C ${startX+70} ${n.y+CARD.height/2},${x-70} ${y},${x} ${y}" fill="none" stroke="${candidate&&!valid?'#c88c83':'#007AFF'}" stroke-width="2.5"></path><circle cx="${x}" cy="${y}" r="4" fill="#007AFF"></circle>`;
  }
});
document.addEventListener('pointerup',event=>{
  if(cordDrag){const old=cordDrag,delta=event.clientY-old.startY;cordDrag=null;old.pull.classList.remove('is-dragging');old.pull.style.removeProperty('--cord-offset');if(Math.abs(delta)>12){suppressCordClick=true;setTimeout(()=>suppressCordClick=false,0);if((!old.wasOpen&&delta>12)||(old.wasOpen&&delta< -12))toggleShelf();}return;}
  if(!drag)return;const old=drag;drag=null;$('#surface')?.classList.remove('is-panning');
  if(old.type==='node'){
    if(old.moved&&cardMotion){
      if(matchMedia('(prefers-reduced-motion: reduce)').matches){for(let i=0;i<120;i++)if(!repelCards(cardMotion.nodes,cardMotion.fixedId,{activeIds:cardMotion.activeIds,fixedIds:cardMotion.fixedIds,gap:112}).size)break;paintCardPositions(cardMotion.nodes);finishCardMotion();drawGraph();}
      else cardMotion.released=true;
    }else selectNode(old.id,old.additive);
  }
  if(old.type==='pick'&&!old.moved)selectNode(old.id);
  if(old.type==='marquee'){$('#marquee').hidden=true;$('#surface').classList.remove('is-marquee');if(!old.moved)setCanvasSelection(old.base);drawGraph();}
  if(old.type==='pan'&&!old.moved){if(!event.target.closest('[data-node],[data-edge]')){menu=null;fanPinned=null;$$('.fan-pinned').forEach(el=>el.classList.remove('fan-pinned'));drawNodePanel();}}
  if(old.type==='link'){$('#link-preview').innerHTML='';const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-node]');if(old.moved){connecting=null;drawGraph();if(target&&target.dataset.node!==old.id)combine(old.id,target.dataset.node);}else{connecting=old.id;drawGraph();}}
});
function updateEdgePositions(positions=graphNodes()){
  const edgeIndex=new Map(p.edges.map(e=>[e.id,e])),nodeIndex=new Map(p.nodes.map(n=>[n.id,n]));
  for(const n of positions)nodeIndex.set(n.id,n);
  for(const group of $$('.edge-group')){const edge=edgeIndex.get(group.dataset.edge),a=nodeIndex.get(edge.from),b=nodeIndex.get(edge.to),c=curve(a,b);$$('path',group).forEach(path=>path.setAttribute('d',c.d));$('.edge-label',group).setAttribute('transform',`translate(${c.mx},${c.my})`);}
  const previews=$$('.pending-connector');if(pending?.positions)previews.forEach((el,i)=>{const source=nodeIndex.get(pending.sourceIds[i]);if(source)el.setAttribute('d',curve(source,pending.positions[0]).d);});
}
function cancelCanvasDrag(){
  if(!drag)return;const old=drag,before=old.type==='node'&&old.moved?old.before:null;
  finishCardMotion(false);drag=null;connecting=null;if(before){p=before;persist();}
  if(old.oldSelection)setCanvasSelection(old.oldSelection);
  $('#surface')?.classList.remove('is-panning','is-marquee');if($('#marquee'))$('#marquee').hidden=true;if($('#link-preview'))$('#link-preview').innerHTML='';
  if(screen==='workspace')drawGraph();
}
document.addEventListener('pointercancel',()=>{if(cordDrag){cordDrag.pull.classList.remove('is-dragging');cordDrag.pull.style.removeProperty('--cord-offset');cordDrag=null;}cancelCanvasDrag();});
document.addEventListener('click',event=>{
  const action=event.target.closest('[data-action]');if(action){event.stopPropagation();if(action.dataset.action==='shelf'&&suppressCordClick){suppressCordClick=false;return;}dispatch(action.dataset.action,action);return;}
  const edge=event.target.closest('[data-edge]');if(edge){const e=p.edges.find(v=>v.id===edge.dataset.edge);openModal('edge',e);}
});
document.addEventListener('change',event=>{if(event.target.matches('[data-saved-check]')){const id=event.target.dataset.savedCheck;event.target.checked?savedSelection.add(id):savedSelection.delete(id);drawShelf();}});
function dispatch(action,el){
  finishCardMotion();
  if(pending&&['arrange','undo','redo','assign','count'].includes(action))return toast('正在为新卡片留出空间，生成完成后即可调整布局。');
  stopLayoutAnimation();
  const id=el?.dataset.id;
  if(editing&&!['edit','cancel-edit','cancel-generation','close-menu'].includes(action)&&!saveInlineEdit())return;
  try{switch(action){
    case'home':pending?.controller.abort();pending=null;persist();screen='home';modal=null;overlays.innerHTML='';render();break;
    case'new-project':openModal('new-project');break;
    case'open-projects':openModal('open-projects');break;
    case'open-project':closeModal();openProject(projects.find(v=>v.id===id));break;
    case'delete-project':openModal('delete-project',id);break;
    case'import':$('#file-import').click();break;
    case'demo':openDemo();break;
    case'model':openModal('model');break;
    case'project-settings':openModal('project-settings');break;
    case'shelf':toggleShelf();break;
    case'outline':showOutline=!showOutline;renderWorkspace();break;
    case'fit':fitView(null,true);break;
    case'arrange':{const before=clone(p.nodes);commit(()=>arrangeByMainline(p));menu=null;fanPinned=null;connecting=null;assigning=null;drawGraph();animateLayout(before);revealCards(visibleNodes(p,{focusId,showHidden}));toast('已按主线整理。');break;}
    case'zoom-in':zoomBy(1.16);break;
    case'zoom-out':zoomBy(1/1.16);break;
    case'undo':{
      const removed=generations.undo(p);if(!removed.length)break;
      if(!p.nodes.some(n=>n.id===selected))selectOnly(rootOf(p).id);if(!p.nodes.some(n=>n.id===focusId))focusId=null;
      assigning=null;connecting=null;menu=null;persist();drawGraph();toast(`已撤回 ${removed.length} 张卡片`);break;
    }
    case'redo':{
      const restored=generations.redo(p);if(!restored.length)break;
      selectOnly(restored[0].id);assigning=null;connecting=null;menu=null;persist();drawGraph();toast(`已恢复 ${restored.length} 张生成卡片。`);break;
    }
    case'count':p.generationCount=Number(el.dataset.count);persist();renderWorkspace();break;
    case'node-menu':{const same=selected===id;selectOnly(id);fanPinned=null;menu=menu==='node'&&same?null:'node';drawGraph();break;}
    case'close-menu':menu=null;drawNodePanel();break;
    case'expand':fanPinned=null;generate(id,el.dataset.kind);break;
    case'expand-same':{const n=p.nodes.find(v=>v.id===id);selectOnly(id);if(isInspiration()){generate(id,inspirationStep(p,n).targetKind);}else if(n.kind==='root'){menu=null;fanPinned=fanPinned===id?null:id;drawGraph();}else generate(id,n.kind);break;}
    case'favorite':{let result;commit(()=>result=favoriteNode(p,id));drawGraph();toast(result?'已收藏':'已取消收藏','success',result?'⭐':'');break;}
    case'edit':beginInlineEdit(id);break;
    case'cancel-edit':{const id=editing?.id;editing=null;drawGraph();$(`[data-node="${id}"]`)?.focus({preventScroll:true});break;}
    case'hide-selected':if(selected&&current().kind!=='root'){commit(()=>current().hidden=true);selectOnly(rootOf(p).id);focusId=null;showHidden=false;menu=null;drawGraph();}break;
    case'branch-menu':branchMenu=!branchMenu;drawBranchControls();break;
    case'restore-branch':commit(()=>{for(const node of ancestorsOf(p,id))node.hidden=false;});focusId=null;selectOnly(id);branchMenu=false;drawGraph();revealCards(visibleNodes(p));break;
    case'restore-all':commit(()=>p.nodes.forEach(node=>node.hidden=false));focusId=null;branchMenu=false;drawGraph();revealCards(visibleNodes(p));break;
    case'focus-selected':focusId=focusId?null:selected;menu=null;branchMenu=false;renderWorkspace();fitView(null,true);break;
    case'details':openModal('node-detail',p.nodes.find(n=>n.id===(id||selected)));break;
    case'assign':assigning=id;connecting=null;menu=null;drawGraph();break;
    case'connect':connecting=id;assigning=null;menu=null;drawGraph();break;
    case'cancel-selection':assigning=null;connecting=null;drawGraph();break;
    case'cancel-generation':pending?.controller.abort();clearPending();break;
    case'locate':if(!graphNodes().some(node=>node.id===id)){commit(()=>{for(const node of ancestorsOf(p,id))node.hidden=false;});focusId=null;}if(assigning||connecting){selectNode(id);centerNode(id);}else{selectOnly(id);menu=null;drawGraph();centerNode(id);}break;
    case'focus':focusId=id;selectOnly(id);menu=null;renderWorkspace();fitView();break;
    case'unfocus':focusId=null;renderWorkspace();fitView();break;
    case'toggle-hidden':showHidden=!showHidden;renderWorkspace();break;
    case'hide':commit(()=>{const n=p.nodes.find(n=>n.id===id);n.hidden=!n.hidden;});if(current().id===id&&current().hidden)selectOnly(rootOf(p).id);menu=null;drawGraph();toast('已更新显示状态');break;
    case'delete-node':openModal('delete-node',id);break;
    case'saved-detail':openModal('saved-detail',p.favorites.find(f=>f.id===id));break;
    case'return-to-card':closeModal();showShelf=false;renderWorkspace();selectOnly(id);drawGraph();centerNode(id);break;
    case'export':openModal('export');break;
    case'export-selection':openModal('export',{scope:'canvas'});break;
    case'clear-canvas-selection':selectOnly(null);drawGraph();break;
    case'export-scope-project':openModal('export',{scope:'project'});break;
    case'export-scope-canvas':openModal('export',{scope:'canvas'});break;
    case'saved-select-mode':savedMultiSelect=!savedMultiSelect;if(!savedMultiSelect)savedSelection.clear();drawShelf();break;
    case'export-saved':openModal('export',true);break;
    case'share':openModal('share');break;
    case'close-modal':closeModal();break;
    case'download-json':{const scope=exportScope(),value=scope.mode==='canvas'?selectionExport(p,scope.ids):p;download(JSON.stringify(value,null,2),exportTitle()+'.json','application/json');toast(scope.mode==='canvas'?'选区已导出':'项目已导出');break;}
    case'download-md':download(selectedMarkdown(),exportTitle()+'.md','text/markdown;charset=utf-8');toast('方向与细化理由已导出。');break;
    case'download-png':exportPng();break;
    case'print':printProject();break;
    case'copy-share':copyShare();break;
    case'clear-model':api('/model/clear',{}).then(()=>{model={mode:'unconfigured'};closeModal();updateModelBadge();toast('已清除本次模型配置。');});break;
    case'copy-direction':{const saved=p.favorites.find(f=>f.id===id);copyText(toMarkdown(p,saved));break;}
    case'remove-saved':{
      const position=p.favorites.findIndex(f=>f.id===id);if(position<0)break;
      commit(()=>p.favorites=p.favorites.filter(f=>f.id!==id));savedSelection.delete(id);
      if(modal?.kind==='saved-detail'&&modal.data.id===id)closeModal();
      drawGraph();
      if(!modal&&showShelf){const next=p.favorites[Math.min(position,p.favorites.length-1)];if(next)$(`[data-saved-card="${next.id}"] .saved-favorite`)?.focus({preventScroll:true});else $('.shelf-pull')?.focus({preventScroll:true});}
      toast('已取消收藏。');break;
    }
  }}catch(error){toast(error.message,'error');}
}
function modalShell(title,body,footer='',wide=false,symbol=''){return `<div class="modal-backdrop"><section class="modal ${wide?'modal-wide':''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header class="modal-header"><div><span class="modal-eyebrow">有点想法</span><h2>${symbol?emoji(symbol):''}${esc(title)}</h2></div>${iconButton('关闭','close-modal','',{symbol:'×'})}</header>${body}${footer?`<footer class="modal-footer">${footer}</footer>`:''}</section></div>`;}
function pathMarkup(snapshot){return snapshot.paths.map(path=>`<ol class="detail-path">${path.map(id=>{const n=snapshot.nodes.find(n=>n.id===id);return n?`<li>${chip(n.kind)}<strong>${esc(n.title)}</strong><p>${esc(n.rationale||'最初的想法')}</p></li>`:'';}).join('')}</ol>`).join('');}
const motionDuration=value=>matchMedia('(prefers-reduced-motion: reduce)').matches?0:value;
function releaseDirection(state){state?.flightAnimation?.cancel();state?.turnAnimation?.cancel();state?.source?.classList.remove('is-in-flight');}
function flightTransform(rect,target){return `translate(${rect.left-target.left}px, ${rect.top-target.top}px) scale(${rect.width/target.width}, ${rect.height/target.height})`;}
function openDirection(data){
  const source=$(`[data-saved-card="${data.id}"]`),width=Math.min(660,innerWidth-32),height=Math.min(690,innerHeight-48),target={left:(innerWidth-width)/2,top:(innerHeight-height)/2,width,height};
  const rect=source?.getBoundingClientRect()||{left:innerWidth/2-110,top:120,width:220,height:126};
  lastFocus=document.activeElement;const state={kind:'saved-detail',data,source,rect,target,closing:false};modal=state;
  const footer=button('取消收藏','remove-saved',{id:data.id,class:'danger-text'})+button('复制方向','copy-direction',{id:data.id})+(p.nodes.some(n=>n.id===data.nodeId)?button('回到画布','return-to-card',{id:data.nodeId,class:'primary'}):'');
  overlays.innerHTML=`<div class="modal-backdrop direction-backdrop"><div class="direction-flight" style="left:${target.left}px;top:${target.top}px;width:${width}px;height:${height}px"><div class="direction-turn"><div class="direction-front type-${data.kind}" aria-hidden="true"><span class="direction-front-clip"></span><span class="saved-kicker">${KINDS[data.kind].label} · 已收藏</span><h2>${esc(data.title)}</h2><p>${esc(data.description)}</p></div><section class="modal direction-back" role="dialog" aria-modal="true" aria-label="${esc(data.title)}"><header class="modal-header"><div><span class="modal-eyebrow">收藏的方向 · 背面</span><h2>${esc(data.title)}</h2></div>${iconButton('翻回并收起','close-modal','',{symbol:'×'})}</header><div class="direction-content"><div class="saved-detail-intro">${chip(data.kind)}<span>收藏于 ${new Date(data.createdAt).toLocaleString('zh-CN')}</span></div><p class="detail-description">${esc(data.description)}</p><div class="detail-reason"><span>细化理由</span><p>${esc(data.rationale)}</p></div><h3 class="detail-section-title">探索路径</h3>${pathMarkup(data.snapshot)}</div><footer class="modal-footer">${footer}</footer></section></div></div></div>`;
  source?.classList.add('is-in-flight');bindModal('saved-detail',data);
  const flight=$('.direction-flight'),turn=$('.direction-turn'),duration=motionDuration(620);
  state.flightAnimation=flight.animate([{transform:flightTransform(rect,target)},{transform:'translate(0, 0) scale(1, 1)'}],{duration,easing:'cubic-bezier(.2,.75,.2,1)'});
  state.turnAnimation=turn.animate([{transform:'rotateY(0deg)'},{transform:'rotateY(180deg)'}],{duration,delay:motionDuration(45),easing:'cubic-bezier(.35,0,.15,1)'});
  state.turnAnimation.finished.then(()=>{if(modal===state&&!state.closing)$('.direction-back [data-action="close-modal"]')?.focus({preventScroll:true});}).catch(()=>{});
}
async function closeDirection(state){
  if(state.closing)return;state.closing=true;
  const flight=$('.direction-flight'),turn=$('.direction-turn');if(!flight||!turn){releaseDirection(state);modal=null;overlays.innerHTML='';return;}
  const currentFlight=getComputedStyle(flight).transform,currentTurn=getComputedStyle(turn).transform,rect=state.source?.isConnected?state.source.getBoundingClientRect():state.rect;
  releaseDirection(state);state.source?.classList.add('is-in-flight');$('.direction-backdrop').classList.add('is-leaving');
  const duration=motionDuration(480);
  state.flightAnimation=flight.animate([{transform:currentFlight},{transform:flightTransform(rect,state.target)}],{duration,easing:'cubic-bezier(.4,0,.25,1)',fill:'forwards'});
  state.turnAnimation=turn.animate([{transform:currentTurn},{transform:'rotateY(0deg)'}],{duration:motionDuration(420),easing:'cubic-bezier(.4,0,.2,1)',fill:'forwards'});
  try{await state.flightAnimation.finished;}catch{}
  if(modal!==state)return;releaseDirection(state);modal=null;overlays.innerHTML='';
  if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});else (showShelf?$('.shelf-pull'):$('#surface'))?.focus({preventScroll:true});
}
function openModal(kind,data=null){
  if(modal?.kind==='saved-detail')releaseDirection(modal);
  menu=null;fanPinned=null;drawNodePanel();
  if(kind==='saved-detail'){openDirection(data);return;}
  lastFocus=document.activeElement;modal={kind,data};let body='',footer='',title='',wide=false;
  const headingEmoji={'new-project':'🌱','open-projects':'📂',share:'💌'}[kind]||'';
  if(kind==='open-projects'){
    title='打开项目';wide=true;
    body=`<div class="project-picker">${projects.length?`<div class="project-picker-grid">${projects.map(project=>`<article class="project-card"><button class="project-open" data-action="open-project" data-id="${project.id}"><span class="project-card-icon">${emoji('🌱')}</span><h3>${esc(project.title)}</h3><p>${esc(project.description)}</p><footer><span>${project.nodes.length} 张卡片</span><time>${new Date(project.updatedAt).toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'})}</time></footer></button><button class="project-delete" data-action="delete-project" data-id="${project.id}" aria-label="删除项目 ${esc(project.title)}">×</button></article>`).join('')}</div>`:'<p class="picker-empty">暂无项目</p>'}</div>`;
    footer=button('从文件打开','import',{icon:'file'})+button('关闭','close-modal');
  }
  if(kind==='new-project'){
    title='新建探索';body=`<form id="new-project-form"><label class="field"><span>选题内容</span><textarea id="project-description" rows="5" maxlength="2000" required ></textarea></label><label class="field"><span>项目名称 <em>选填</em></span><input id="project-name" maxlength="50" ></label><div class="form-actions">${button('取消','close-modal')}<button type="submit" class="button primary">创建 ${icon('arrow')}</button></div></form>`;
  }
  if(kind==='model'){
    const deepseek=model.provider==='deepseek'||!model.baseUrl||model.baseUrl.includes('api.deepseek.com');
    const existingName=/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(model.model||'')||/^sk[-_]/.test(model.model||'')?'':model.model;
    const choices=model.models?.length?model.models:[{id:'deepseek-flash'},{id:'deepseek-v4-pro'}];
    title='连接你的 AI';body=`<form id="model-form"><label class="field"><span>模型服务</span><select id="model-provider"><option value="deepseek" ${deepseek?'selected':''}>DeepSeek 官方</option><option value="custom" ${deepseek?'':'selected'}>其他兼容服务</option></select></label><label class="field"><span>API 地址</span><input id="model-url" type="url" required value="${esc(model.baseUrl||'https://api.deepseek.com')}" placeholder="https://api.deepseek.com"></label><label class="field"><span>API Key · 密钥</span><input id="model-key" type="password" ${model.hasKey?'':'required'} placeholder="${model.hasKey?'已配置':'API Key'}" autocomplete="off"></label><label class="field"><span>模型 ID</span><div class="model-choice-row"><input id="model-name" list="available-models" required value="${esc(existingName||(deepseek?'deepseek-flash':''))}" placeholder="模型 ID" autocomplete="off"><button type="button" class="button" id="load-models">读取可用模型</button></div><datalist id="available-models">${choices.map(v=>`<option value="${esc(v.id)}">${esc(v.name||v.id)}</option>`).join('')}</datalist></label><p class="form-error" id="model-error" role="alert" hidden></p><div class="form-actions">${model.mode==='live'?button('清除配置','clear-model',{class:'danger-text'}):button('取消','close-modal')}<button type="submit" class="button primary" id="save-model">${queuedAfterModel?'验证并继续生成':deepseek?'保存并验证':'保存配置'}</button></div></form>`;
  }

  if(kind==='project-settings'){
    title='项目设置';body=`<form id="context-form"><label class="field"><span>项目名称</span><input id="context-title" value="${esc(p.title)}" maxlength="50" required></label><div class="original-idea"><span>最初的粗想法</span><p>${esc(p.description)}</p></div><label class="field"><span>补充条件与背景</span><textarea id="context-text" rows="5" maxlength="3000" >${esc(p.context)}</textarea></label><div class="form-actions">${button('取消','close-modal')}<button type="submit" class="button primary">保存背景</button></div></form>`;
  }
  if(kind==='node-detail'){
    title=data.title;wide=true;const paths=getPaths(p,data.id),nodes=ancestorsOf(p,data.id);body=`${chip(data.kind)}<p class="detail-description">${esc(data.description)}</p><h3 class="detail-section-title">完整探索路径</h3>${pathMarkup({nodes,paths:paths.map(path=>path.map(n=>n.id))})}`;footer=button('关闭','close-modal')+button('编辑内容与理由','edit',{id:data.id,class:'primary'});
  }
  if(kind==='edge'){
    title='卡片关联';const a=p.nodes.find(n=>n.id===data.from),b=p.nodes.find(n=>n.id===data.to);body=`<div class="edge-detail"><div>${chip(a.kind)}<strong>${esc(a.title)}</strong></div><span class="edge-detail-arrow">↓ ${esc(data.relation)}</span><div>${chip(b.kind)}<strong>${esc(b.title)}</strong></div></div><div class="detail-reason"><span>关联理由</span><p>${esc(data.rationale||b.rationale)}</p></div>`;footer=button('关闭','close-modal')+button('查看下层卡片','return-to-card',{id:b.id,class:'primary'});
  }
  if(kind==='export'){
    const mode=data===true?'favorites':data?.scope||(canvasSelection.size>1?'canvas':'project');
    modal.exportScope={mode,ids:[...canvasSelection]};
    title=mode==='favorites'?'导出收藏方向':'导出';
    const scopePicker=mode==='favorites'?'':`<div class="export-scope segmented" role="group" aria-label="导出范围">${button('整个项目','export-scope-project',{class:mode==='project'?'selected':'',extra:`aria-pressed="${mode==='project'}"`})}${button('选中的 '+canvasSelection.size+' 张','export-scope-canvas',{class:mode==='canvas'?'selected':'',disabled:!canvasSelection.size,extra:`aria-pressed="${mode==='canvas'}"`})}</div>`;
    body=scopePicker+`<div class="export-options">${mode==='favorites'?'':`<button data-action="download-json">${icon('branch')}<div><strong>${mode==='canvas'?'选区文件':'项目文件'}</strong><span>JSON</span></div>${icon('arrow')}</button>`}<button data-action="download-md">${icon('file')}<div><strong>方向文档</strong><span>Markdown</span></div>${icon('arrow')}</button>${mode==='favorites'?'':`<button data-action="download-png">${icon('scene')}<div><strong>画布图片</strong><span>PNG</span></div>${icon('arrow')}</button><button data-action="print">${icon('file')}<div><strong>保存为 PDF</strong></div>${icon('arrow')}</button>`}</div>`;footer=button('关闭','close-modal');
  }

  if(kind==='share'){
    title='分享这次探索';body=`<div class="original-idea"><strong>${esc(p.title)}</strong><p>${p.nodes.length} 个想法 · ${p.favorites.length} 个已收藏方向</p></div>`;footer=button('导出项目文件','download-json')+button('复制链接','copy-share',{class:'primary'});
  }

  if(kind==='delete-node'||kind==='delete-project'){
    title=kind==='delete-node'?'删除这条分支？':'删除这个项目？';body='';footer=button('取消','close-modal')+`<button class="button destructive" id="confirm-delete">确认删除</button>`;
  }
  overlays.innerHTML=modalShell(title,body,footer,wide,headingEmoji);bindModal(kind,data);requestAnimationFrame(()=>($('.modal input,.modal textarea')||$('.modal button'))?.focus());
}
function closeModal(){if(modal?.kind==='saved-detail'){closeDirection(modal);return;}if(modal?.kind==='model')queuedAfterModel=null;modal=null;overlays.innerHTML='';if(lastFocus?.isConnected)lastFocus.focus();else if(screen==='workspace')(showShelf?$('.shelf-pull'):$('#surface'))?.focus({preventScroll:true});}
function bindModal(kind,data){
  $('.modal-backdrop').addEventListener('click',e=>{if(e.target===e.currentTarget)closeModal();});
  $('#new-project-form')?.addEventListener('submit',e=>{e.preventDefault();const description=$('#project-description').value.trim();if(!description)return;const project=createProject(description,$('#project-name').value);projects.unshift(project);closeModal();openProject(project);persist();fanPinned=rootOf(p).id;drawGraph();toast('已创建探索');});
  const connectionInput=()=>({baseUrl:$('#model-url').value.trim(),provider:$('#model-provider').value,model:$('#model-name').value.trim(),apiKey:$('#model-key').value});
  $('#model-provider')?.addEventListener('change',()=>{const deepseek=$('#model-provider').value==='deepseek';$('#model-url').value=deepseek?'https://api.deepseek.com':model.provider==='custom'?model.baseUrl:'';$('#model-name').value=deepseek?'deepseek-flash':model.provider==='custom'?model.model:'';$('#model-key').required=!model.hasKey;$('#save-model').textContent=queuedAfterModel?'验证并继续生成':deepseek?'保存并验证':'保存配置';});
  $('#load-models')?.addEventListener('click',async()=>{const load=$('#load-models'),error=$('#model-error');load.disabled=true;load.textContent='正在读取…';error.hidden=true;try{const result=await api('/models',connectionInput());$('#available-models').innerHTML=result.models.map(v=>`<option value="${esc(v.id)}">${esc(v.name||v.id)}</option>`).join('');if(!result.models.some(v=>v.id===$('#model-name').value))$('#model-name').value=result.models[0].id;toast(`已读取 ${result.models.length} 个模型`);}catch(err){error.hidden=false;error.textContent=err.message;}finally{load.disabled=false;load.textContent='读取可用模型';}});
  $('#model-form')?.addEventListener('submit',async e=>{e.preventDefault();const submit=$('#save-model'),error=$('#model-error');submit.disabled=true;submit.textContent='正在验证…';error.hidden=true;try{model=await api('/model',connectionInput());const work=queuedAfterModel;closeModal();updateModelBadge();toast('模型配置已保存');work?.();}catch(err){error.hidden=false;error.textContent=err.message;submit.disabled=false;submit.textContent='重试保存';}});
  $('#context-form')?.addEventListener('submit',e=>{e.preventDefault();const title=$('#context-title').value.trim(),context=$('#context-text').value.trim();commit(()=>Object.assign(p,{title,context}));closeModal();renderWorkspace();toast('背景已保存');});
  $('#confirm-delete')?.addEventListener('click',()=>{if(kind==='delete-node'){commit(()=>removeBranch(p,data));if(!p.nodes.some(n=>n.id===focusId))focusId=null;selectOnly(rootOf(p).id);closeModal();renderWorkspace();toast('已删除分支。');}else{projects=projects.filter(v=>v.id!==data);p=null;persist();closeModal();renderHome();}});
}
document.addEventListener('keydown',e=>{
  if(modal&&e.key==='Tab'){const items=$$('button:not([disabled]),input,textarea,select,[tabindex="0"]',$('.modal')),first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}return;}
  if(e.key==='Escape'&&editing&&!modal){e.preventDefault();dispatch('cancel-edit');return;}
  if(e.key==='Escape'){if(modal){closeModal();queuedAfterModel=null;}else if(showShelf){toggleShelf();}else if(branchMenu){branchMenu=false;drawBranchControls();}else{menu=null;fanPinned=null;connecting=null;assigning=null;if(drag){cancelCanvasDrag();return;}selectOnly(null);if(focusId){focusId=null;renderWorkspace();}else if(screen==='workspace')drawGraph();}return;}
  if(e.defaultPrevented)return;
  if(e.target.closest('lg-segmented')&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Enter'].includes(e.key))return;
  if(e.code==='Space'&&e.target.closest('button,lg-button'))return;
  const isTextEditing=/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
  if((e.metaKey||e.ctrlKey)&&e.key==='Enter'&&editing){e.preventDefault();saveInlineEdit();return;}
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'&&screen==='workspace'){e.preventDefault();$('#node-search').focus();return;}
  if(isTextEditing||modal)return;
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='a'&&screen==='workspace'){e.preventDefault();setCanvasSelection(graphNodes().map(n=>n.id));menu=null;fanPinned=null;drawGraph();return;}
  if(screen==='workspace'&&canvasSelection.size&&!pending&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){
    e.preventDefault();finishCardMotion();stopLayoutAnimation();const before=clone(p.nodes),amount=e.shiftKey?80:20,origins=branchPositions(p,[...canvasSelection]);
    commit(()=>{moveBranch(p,origins,e.key==='ArrowLeft'?-amount:e.key==='ArrowRight'?amount:0,e.key==='ArrowUp'?-amount:e.key==='ArrowDown'?amount:0);spreadCrowdedCards(p.nodes,new Set(origins.keys()));});drawGraph();animateLayout(before);return;
  }
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'&&p){e.preventDefault();dispatch(e.shiftKey?'redo':'undo');return;}
  if(e.code==='Space'&&screen==='workspace'){spaceHeld=true;e.preventDefault();$('#surface').classList.add('space-pan');}
  if(e.key==='Enter'&&document.activeElement?.matches('[data-node]')){e.preventDefault();selectNode(document.activeElement.dataset.node,e.shiftKey);}
  if(e.key==='Enter'&&document.activeElement?.matches('[data-handle]')){e.preventDefault();connecting=document.activeElement.dataset.handle;assigning=null;fanPinned=null;drawGraph();}
  if(e.key==='Enter'&&document.activeElement?.matches('[data-edge]')){e.preventDefault();openModal('edge',p.edges.find(v=>v.id===document.activeElement.dataset.edge));}
});
document.addEventListener('keyup',e=>{if(e.code==='Space'){spaceHeld=false;$('#surface')?.classList.remove('space-pan');}});
function download(content,filename,type){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([content],{type}));a.href=url;a.download=filename.replace(/[\\/:*?"<>|]/g,'-');a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exportScope(){return modal?.kind==='export'?modal.exportScope||{mode:'project'}:{mode:'project'};}
function exportTitle(){return p.title+(exportScope().mode==='canvas'?' · 选区':'');}
function exportNodes(){const scope=exportScope();return scope.mode==='canvas'?p.nodes.filter(n=>scope.ids.includes(n.id)):visibleNodes(p,{focusId,showHidden});}
function selectedMarkdown(){
  const scope=exportScope();
  if(scope.mode==='canvas')return toMarkdown(selectionExport(p,scope.ids));
  if(scope.mode==='favorites')return `# ${p.title}\n\n`+p.favorites.filter(f=>savedSelection.has(f.id)).map(f=>toMarkdown(p,f)).join('\n\n---\n\n');
  return toMarkdown(p);
}
async function copyText(value){try{await navigator.clipboard.writeText(value);toast('已复制');}catch{toast('浏览器未允许复制，请使用导出文件。','error');}}
async function copyShare(){const bytes=new TextEncoder().encode(JSON.stringify(p));if(bytes.length>450000)return toast('项目内容较多，请通过项目文件分享。','error');let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);await copyText(new URL('./',location.href).href+'#project='+btoa(binary));}
$('#file-import').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>5e6)throw new Error('项目文件过大，请选择小于 5MB 的文件');const value=JSON.parse(await file.text()),project=value.format==='topic-explorer-selection'?importSelection(value):validateProject(value);project.id=uid();project.title+=' · 导入';projects.unshift(project);closeModal();openProject(project);persist();toast('项目已打开');}catch(error){toast(error.message,'error');}e.target.value='';});
function wrapText(ctx,value,width,maxLines=3){const lines=[];let line='';for(const char of String(value)){if(ctx.measureText(line+char).width>width){lines.push(line);line=char;if(lines.length>=maxLines){lines[lines.length-1]=lines.at(-1).slice(0,-1)+'…';return lines;}}else line+=char;}if(line)lines.push(line);return lines;}
async function exportPng(){
  const title=exportTitle(),nodes=exportNodes(),b=boundsOf(nodes),pad=60,s=Math.min(2,6000/(b.width+pad*2)),canvas=document.createElement('canvas');canvas.width=(b.width+pad*2)*s;canvas.height=(b.height+pad*2+90)*s;const ctx=canvas.getContext('2d');ctx.scale(s,s);ctx.fillStyle='#F5F5F7';ctx.fillRect(0,0,canvas.width/s,canvas.height/s);ctx.fillStyle='#1D1D1F';ctx.font='600 24px -apple-system, BlinkMacSystemFont, sans-serif';ctx.fillText(title,pad,43);ctx.translate(pad-b.x,pad+65-b.y);const ids=new Set(nodes.map(n=>n.id));
  for(const e of p.edges.filter(e=>ids.has(e.from)&&ids.has(e.to))){const a=p.nodes.find(n=>n.id===e.from),bn=p.nodes.find(n=>n.id===e.to);ctx.strokeStyle=SCENE_CATEGORIES[edgeSceneCategories(p,e)[0]||'other'].color;ctx.lineWidth=1.5;ctx.stroke(new Path2D(curve(a,bn).d));}
  const colors={direction:'#8060ae',idea:'#328a82',root:'#007AFF',scene:'#8A6BD0',pain:'#D47D42',people:'#328A82'};
  for(const n of nodes){ctx.fillStyle='#FFFFFF';ctx.strokeStyle='#E1E3E8';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(n.x,n.y,CARD.width,CARD.height,18);ctx.fill();ctx.stroke();ctx.fillStyle=colors[n.kind];ctx.font='500 12px -apple-system,sans-serif';ctx.fillText(KINDS[n.kind].label,n.x+18,n.y+26);ctx.fillStyle='#1D1D1F';ctx.font='600 16px -apple-system,sans-serif';wrapText(ctx,n.title,CARD.width-36,2).forEach((line,i)=>ctx.fillText(line,n.x+18,n.y+55+i*23));ctx.fillStyle='#6E6E73';ctx.font='12px -apple-system,sans-serif';wrapText(ctx,n.description,CARD.width-36,2).forEach((line,i)=>ctx.fillText(line,n.x+18,n.y+105+i*18));}
  canvas.toBlob(blob=>{if(!blob)return toast('图片导出失败，请重试。','error');download(blob,title+'.png','image/png');toast('画布图片已导出。');},'image/png');
}
function printProject(){
  const old=$('#print-content');old?.remove();const print=document.createElement('section');print.id='print-content';
  const scope=exportScope(),nodes=scope.mode==='canvas'?exportNodes():p.nodes;
  const content=scope.mode!=='canvas'&&p.favorites.length?p.favorites.map(f=>`<article><h2>${esc(f.title)}</h2><p>${esc(f.description)}</p><p>${esc(f.rationale)}</p>${pathMarkup(f.snapshot)}</article>`):nodes.map(n=>`<article><h2>${esc(n.title)}</h2><p>${esc(n.description)}</p><p>${esc(n.rationale)}</p></article>`);
  print.innerHTML=`<h1>${esc(exportTitle())}</h1>${scope.mode==='canvas'?'':`<p>${esc(p.description)}</p>`}${content.join('')}`;document.body.appendChild(print);window.print();
}
window.addEventListener('resize',()=>{if(screen==='workspace'){drawNodePanel();if(editing)requestAnimationFrame(positionInlineEditor);}});
render();refreshModel();
if(location.hash.startsWith('#project=')){try{const binary=atob(location.hash.slice(9));const value=JSON.parse(new TextDecoder().decode(Uint8Array.from(binary,c=>c.charCodeAt(0)))),project=validateProject(value);project.id=uid();project.title+=' · 副本';projects.unshift(project);openProject(project);persist();window.history.replaceState(null,'',location.pathname);}catch{toast('分享链接无法打开，可以让对方导出项目文件。','error');}}
if(new URLSearchParams(location.search).has('demo'))openDemo();
