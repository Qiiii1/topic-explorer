import { KINDS, CARD, uid, clone, createProject, rootOf, getPaths, ancestorsOf, descendantsOf, appendGenerated, appendManual, mergeNodes, assignParent, favoriteNode, removeBranch, visibleNodes, boundsOf, validateProject, toMarkdown } from './domain.js';
import { demoGenerate } from './demo.js';

const $=(selector,scope=document)=>scope.querySelector(selector);
const $$=(selector,scope=document)=>[...scope.querySelectorAll(selector)];
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons={branch:'git-branch',search:'search',back:'arrow-left',arrow:'arrow-right',scene:'stack-2',pain:'rocket',people:'users',merge:'git-merge',settings:'world-cog',file:'file-text',save:'device-floppy',refresh:'refresh',layers:'stack-2',link:'arrows-split',tag:'tag',lock:'lock'};
function icon(name,extra=''){
  if(['plus','star','undo','close'].includes(name))return `<img class="source-icon ${extra}" src="/assets/icons/figma-${name}.svg" alt="" aria-hidden="true">`;
  return icons[name]?`<span class="icon ${extra}" aria-hidden="true" style="--icon:url('/assets/icons/${icons[name]}.svg')"></span>`:'';
}
const button=(label,action,options={})=>`<button type="button" class="button ${options.class||''}" data-action="${action}" ${options.id?`data-id="${esc(options.id)}"`:''} ${options.extra||''} ${options.disabled?'disabled':''}>${options.icon?icon(options.icon):''}${label}</button>`;
const iconButton=(label,action,name,options={})=>`<button type="button" class="icon-button ${options.class||''}" data-action="${action}" aria-label="${esc(label)}" title="${esc(label)}" ${options.id?`data-id="${esc(options.id)}"`:''} ${options.extra||''} ${options.disabled?'disabled':''}>${icon(name)||esc(options.symbol||label)}</button>`;
const chip=kind=>`<span class="type-chip type-${kind}"><span></span>${KINDS[kind].label}</span>`;
const STORAGE='topic-explorer-projects-v1';
let projects=[];try{projects=JSON.parse(localStorage.getItem(STORAGE)||'[]').flatMap(value=>{try{return [validateProject(value)];}catch{return [];}});}catch{projects=[];}
let p=null,screen='home',selected=null,menu=null,showShelf=false,showOutline=false,focusId=null,showHidden=false,tool='select',assigning=null,connecting=null,pending=null,search='',query='',manualDraft='',manualKind='scene',modal=null,model={mode:'unconfigured',model:''},view={x:0,y:0,scale:1},history=[],future=[],savedSelection=new Set(),drag=null,spaceHeld=false;
let lastFocus=null,saveTimer=null,queuedAfterModel=null,fanPinned=null,cordDrag=null,suppressCordClick=false;
const app=$('#app'),overlays=$('#overlays');

function persist(){
  if(p){p.updatedAt=new Date().toISOString();const index=projects.findIndex(v=>v.id===p.id);if(index<0)projects.unshift(p);else projects[index]=p;}
  try{localStorage.setItem(STORAGE,JSON.stringify(projects));}catch{toast('浏览器存储空间不足，请导出项目文件。','error');}
}
function commit(change){history.push(clone(p));if(history.length>60)history.shift();future=[];change();persist();}
function toast(message,type='success'){
  const el=document.createElement('div');el.className=`toast toast-${type}`;el.textContent=message;$('#toasts').appendChild(el);setTimeout(()=>el.remove(),type==='error'?6000:3600);
}
function current(){return p?.nodes.find(n=>n.id===selected)||(p?rootOf(p):null);}
function selectedPaths(){try{return getPaths(p,current().id);}catch{return [];}}
async function api(path,body,signal){
  const response=await fetch('/api'+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal});
  const value=await response.json();if(!response.ok)throw new Error(value.error||'操作未完成，请重试');return value;
}
async function refreshModel(){try{model=await api('/status');if(model.mode==='demo')model.mode='unconfigured';updateModelBadge();}catch{model={mode:'unconfigured',model:''};}}
function updateModelBadge(){const el=$('#model-status');if(el){el.innerHTML=`<span class="status-dot ${model.mode==='live'?'connected':''}"></span><span>${model.mode==='live'?esc(model.model):'连接 AI'}</span>`;el.title=model.mode==='live'?'模型已配置，点击修改':'配置模型服务后即可生成卡片';}if($('#mode-note'))$('#mode-note').textContent=model.mode==='live'?'生成结果待验证':'连接模型后开始生成';}
function header(){return `<header class="app-header">
  <div class="header-start"><button class="brand" data-action="home" aria-label="有点想法，返回首页"><span class="brand-mark">${icon('branch')}</span><span>有点想法<span class="brand-dot">.</span></span></button>
  ${screen==='workspace'?`<span class="header-divider"></span><button class="project-title" data-action="project-settings">${esc(p.title)}<span class="small-chevron">⌄</span></button><span class="autosaved"><span></span>已保存</span>`:''}</div>
  ${screen==='workspace'?`<button class="shelf-pull ${showShelf?'is-open':''}" data-action="shelf" aria-controls="shelf" aria-expanded="${showShelf}" aria-label="${showShelf?'拉起绳子，收起收藏':'拉下绳子，查看收藏'}，${p.favorites.length} 个方向" title="${showShelf?'拉起，收起收藏':'拉一下，查看收藏'}"><img src="/assets/icons/figma-shelf-pull.svg" alt="" aria-hidden="true"><span class="pull-count" ${p.favorites.length?'':'hidden'}>${p.favorites.length}</span></button>`:''}
  <div class="header-actions">${screen==='workspace'?`<label class="search-field">${icon('search')}<input id="node-search" aria-label="搜索节点" placeholder="搜索想法" value="${esc(search)}"><kbd>⌘ K</kbd></label>${button('导出','export')}${button('分享','share')}`:''}
  <button id="model-status" class="model-status" data-action="model"></button>
  ${screen==='workspace'?iconButton('返回项目首页','home','back'):iconButton('使用说明','help','file')}
  </div></header>`;}
function render(){if(screen==='home')renderHome();else renderWorkspace();updateModelBadge();}
function renderHome(){
  screen='home';app.innerHTML=header()+`<main class="home-main"><section class="home-intro"><div class="intro-eyebrow"><span></span>从一个还不确定的想法开始</div><h1>有点想法，<br>就值得往下想。</h1><p>把模糊的好奇，慢慢展开成愿意继续探索的方向。</p><div class="home-primary">${button('新建探索','new-project',{class:'primary large',icon:'plus'})}${button('打开项目','import',{class:'large',icon:'file'})}</div><button class="text-button sample-link" data-action="demo">先看看「人与城市」示例 ${icon('arrow')}</button></section>
  <section class="recent-section"><div class="section-heading"><h2>最近的探索 <span>${projects.length?String(projects.length).padStart(2,'0'):''}</span></h2><span>保存在这台设备上</span></div>${projects.length?`<div class="projects-grid">${projects.map(project=>`<article class="project-card"><button class="project-open" data-action="open-project" data-id="${project.id}"><span class="project-card-icon">${icon('branch')}</span><h3>${esc(project.title)}</h3><p>${esc(project.description)}</p><footer><span>${project.nodes.length} 个想法 · ${project.favorites.length} 个方向</span><time>${new Date(project.updatedAt).toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'})}</time></footer></button><button class="project-delete" data-action="delete-project" data-id="${project.id}" aria-label="删除项目 ${esc(project.title)}">×</button></article>`).join('')}</div>`:`<div class="home-empty">你的探索会出现在这里。一个问题、一点观察，或者一份作业要求，都可以成为起点。</div>`}</section></main><footer class="home-footer"><span>想法可以不成熟，来路要清楚。</span><span>网页交互原型 · v0.1</span></footer>`;
}
function renderWorkspace(){
  app.innerHTML=header()+`<main class="workspace ${showShelf?'with-shelf':''} ${showOutline?'with-outline':''}">
    <div class="path-bar" id="path-bar"></div>
    <button class="collection-backdrop ${showShelf?'is-open':''}" data-action="shelf" aria-label="收起收藏栏" tabindex="-1" ${showShelf?'':'inert'}></button>
    <section class="shelf ${showShelf?'is-open':''}" id="shelf" aria-label="收藏的方向" ${showShelf?'':'inert'}></section>
    <section id="surface" class="canvas-surface ${tool==='hand'?'hand-tool':''}" aria-label="选题探索画布" tabindex="0"><div id="world" class="canvas-world"><svg id="edges" class="edges" width="1" height="1"></svg><div id="nodes"></div><svg id="link-preview" class="link-preview" width="1" height="1"></svg></div><div class="canvas-empty" id="canvas-empty"></div></section>
    <div class="canvas-top-tools glass"><div class="segmented tool-switch"><button data-action="tool-select" class="${tool==='select'?'selected':''}" aria-pressed="${tool==='select'}">选择</button><button data-action="tool-hand" class="${tool==='hand'?'selected':''}" aria-pressed="${tool==='hand'}">平移</button></div><span class="tool-separator"></span>${iconButton('撤销，Command Z','undo','undo',{disabled:!history.length})}${iconButton('重做，Command Shift Z','redo','undo',{class:'redo-icon',disabled:!future.length})}<span class="tool-separator"></span><button class="zoom-button" data-action="zoom-out" aria-label="缩小">−</button><button id="zoom-value" class="zoom-value" data-action="fit" title="适应画面">100%</button><button class="zoom-button" data-action="zoom-in" aria-label="放大">+</button></div>
    <div class="canvas-heading"><span class="eyebrow">正在探索</span><span id="node-count"></span></div>
    <div class="view-tools">${button(showOutline?'收起路径':'探索路径','outline',{class:showOutline?'active':''})}${focusId?button('退出聚焦','unfocus',{class:'active'}):''}${p.nodes.some(n=>n.hidden)?button(showHidden?'隐藏已收起':'显示已收起','toggle-hidden',{class:showHidden?'active':''}):''}</div>
    <aside id="outline" class="outline glass ${showOutline?'is-open':''}" aria-label="探索路径"></aside>
    <aside id="node-panel" class="node-panel glass" aria-label="当前卡片操作" hidden></aside>
    <div id="selection-notice" class="selection-notice glass" hidden></div>
    <section class="manual-dock" aria-label="手动添加卡片"><div class="dock-top"><span><span class="status-dot neutral"></span>手动添加 · 独立卡片</span><div class="generation-setting"><span>每次生成</span><div class="segmented">${[3,6,10].map(n=>`<button data-action="count" data-count="${n}" class="${p.generationCount===n?'selected':''}" aria-pressed="${p.generationCount===n}">${n}</button>`).join('')}</div><span>张</span></div></div>
    <form id="manual-form" class="manual-form glass"><label class="kind-select"><span class="sr-only">卡片类型</span><select id="manual-kind" aria-label="手动卡片类型">${['scene','pain','people'].map(kind=>`<option value="${kind}" ${manualKind===kind?'selected':''}>${KINDS[kind].label}</option>`).join('')}</select></label><label class="manual-input"><span class="sr-only">手动卡片内容</span><textarea id="manual-text" rows="1" maxlength="400" placeholder="写下一点想法，添加成卡片…">${esc(manualDraft)}</textarea></label><button type="submit" class="add-card-button" aria-label="添加独立卡片">${icon('plus')}</button></form><div class="dock-hint"><span>添加后可指定上层，或与同类卡片寻找交集。</span><span><kbd>⌘</kbd> <kbd>↵</kbd> 添加</span></div></section>
    <div class="canvas-footer"><span>拖动画布移动 · 滚轮缩放 · 双击空白处添加卡片</span><span id="mode-note">${model.mode==='live'?'生成结果待验证':'连接模型后开始生成'}</span></div>
    <div id="generation-progress" class="generation-progress glass" hidden></div>
  </main>`;
  $('#manual-form').addEventListener('submit',addManualCard);
  $('#manual-text').addEventListener('input',e=>{manualDraft=e.target.value;});
  $('#manual-kind').addEventListener('change',e=>manualKind=e.target.value);
  $('#node-search').addEventListener('input',e=>{search=e.target.value;drawGraph();});
  bindCanvas();drawGraph();updateModelBadge();
}
function updatePath(){
  const paths=selectedPaths(),path=paths[0]||[],node=current();
  $('#path-bar').innerHTML=`<div class="breadcrumb"><span class="path-caption">当前路径</span>${path.length&&path[0].kind!=='root'?'<span class="independent-label">独立想法</span><span class="crumb-separator">/</span>':''}${path.map((n,i)=>`${i?'<span class="crumb-separator">/</span>':''}<button data-action="locate" data-id="${n.id}" class="${n.id===node.id?'current':''}" title="${esc(n.title)}">${esc(n.kind==='root'?p.title:n.title)}</button>`).join('')}${paths.length>1?`<button class="extra-paths" data-action="details">+${paths.length-1} 条路径</button>`:''}</div><div class="path-reason">${node.kind==='root'?'<span>最初的好奇</span>':`<span>为什么从这里展开</span>`}<p>${esc(node.rationale||'可以为这一步补充关联理由。')}</p></div>`;
}
function curve(a,b){
  const ax=a.x+CARD.width/2,ay=a.y+CARD.height/2,bx=b.x+CARD.width/2,by=b.y+CARD.height/2;
  if(Math.abs(bx-ax)>120){const sign=bx>=ax?1:-1;const x1=ax+sign*CARD.width/2,x2=bx-sign*CARD.width/2,d=Math.max(90,Math.abs(x2-x1)*0.5);return {d:`M ${x1} ${ay} C ${x1+sign*d} ${ay},${x2-sign*d} ${by},${x2} ${by}`,mx:(x1+x2)/2,my:(ay+by)/2};}
  const sign=by>=ay?1:-1,y1=ay+sign*CARD.height/2,y2=by-sign*CARD.height/2,d=Math.max(70,Math.abs(y2-y1)*0.5);return {d:`M ${ax} ${y1} C ${ax} ${y1+sign*d},${bx} ${y2-sign*d},${bx} ${y2}`,mx:(ax+bx)/2,my:(y1+y2)/2};
}
function drawGraph(){
  if(screen!=='workspace'||!p)return;
  const nodes=visibleNodes(p,{focusId,showHidden}),ids=new Set(nodes.map(n=>n.id)),ancestors=new Set(ancestorsOf(p,current().id).map(n=>n.id));
  $('#nodes').innerHTML=nodes.map(n=>{
    const active=n.id===selected,saved=p.favorites.some(f=>f.nodeId===n.id),match=!search||`${n.title} ${n.description}`.toLowerCase().includes(search.toLowerCase());
    const valid=connecting&&connecting!==n.id&&p.nodes.find(v=>v.id===connecting)?.kind===n.kind;
    return `<article class="idea-card kind-${n.kind} ${active?'is-selected':''} ${n.hidden?'is-hidden':''} ${!match?'search-dim':''} ${connecting?'is-connecting':''} ${valid?'valid-target':''} ${assigning&&descendantsOf(p,assigning).has(n.id)?'invalid-parent':''} ${fanPinned===n.id?'fan-pinned':''} ${menu==='node'&&active?'menu-open':''}" style="left:${n.x}px;top:${n.y}px" data-node="${n.id}" role="button" tabindex="0" aria-label="${KINDS[n.kind].label}：${esc(n.title)}" aria-pressed="${active}">
      <div class="dimension-deck" role="group" aria-label="为${esc(n.title)}选择细化维度">${['people','pain','scene'].map((kind,i)=>`<button class="dimension-option type-${kind}" style="--fan-index:${i}" data-action="expand" data-kind="${kind}" data-id="${n.id}" aria-label="从${KINDS[kind].label}细化：${esc(n.title)}"><span class="dimension-dot"></span><strong>${KINDS[kind].label}</strong><span class="dimension-count">${p.generationCount} 张</span>${icon('arrow')}</button>`).join('')}</div><div class="card-surface"><div class="card-top">${n.kind==='root'?'<span class="type-chip type-root"><span></span>主选题</span>':chip(n.kind)}${n.merged?'<span class="merge-tag" title="来自两个想法的交集">∩</span>':''}</div><h3>${esc(n.title)}</h3><button class="card-more" data-action="node-menu" data-id="${n.id}" aria-label="卡片操作：${esc(n.title)}">···</button></div><button class="node-expand" data-action="expand-same" data-id="${n.id}" aria-label="${n.kind==='root'?'展开选题维度':'继续细化'}：${esc(n.title)}">${icon('plus')}</button>${n.kind!=='root'?`<button class="card-star ${saved?'is-saved':''}" data-action="favorite" data-id="${n.id}" aria-label="${saved?'取消收藏':'收藏完整路径'}：${esc(n.title)}" aria-pressed="${saved}">${icon('star')}</button>`:''}<span class="selection-corner" aria-hidden="true">✓</span>${n.kind!=='root'?`<button class="connection-handle handle-right" data-handle="${n.id}" aria-label="拖动加号连接同类卡片：${esc(n.title)}" title="拖出连线，与同类卡片组合"><span aria-hidden="true">+</span></button>`:''}</article>`;
  }).join('');
  $('#edges').innerHTML=p.edges.filter(e=>ids.has(e.from)&&ids.has(e.to)).map(e=>{
    const a=p.nodes.find(n=>n.id===e.from),b=p.nodes.find(n=>n.id===e.to),c=curve(a,b),active=ancestors.has(e.from)&&ancestors.has(e.to),label=e.merged?'共同点 / 交集':e.relation;
    return `<g class="edge-group ${active?'is-active':''} ${e.merged?'merged-edge':''}" data-edge="${e.id}" role="button" tabindex="0" aria-label="查看关联：${esc(a.title)}到${esc(b.title)}"><path class="edge-line" d="${c.d}"></path><path class="edge-hit" d="${c.d}"></path><g class="edge-label" transform="translate(${c.mx},${c.my})"><rect x="-51" y="-13" width="102" height="26" rx="13"></rect><text y="4" text-anchor="middle">${esc(label)}</text></g></g>`;
  }).join('');
  updateView();updatePath();drawShelf();drawOutline();drawNodePanel();updateNotices();
  $('#node-count').textContent=`${p.nodes.length} 个想法${focusId?' · 正在聚焦一条分支':''}`;
  $('#canvas-empty').hidden=p.nodes.length>1;
  if(p.nodes.length===1)$('#canvas-empty').innerHTML='<span>悬停选题中心，在上方选择细化维度。</span><p>场景、痛点、人群，可以从任何一处开始。</p>';
  if(search){const matches=nodes.filter(n=>`${n.title} ${n.description}`.toLowerCase().includes(search.toLowerCase()));$('#node-count').textContent=matches.length?`找到 ${matches.length} 个相关想法`:'没有找到相关想法';}
  const undo=$('[data-action="undo"]'),redo=$('[data-action="redo"]');
  if(undo)undo.disabled=!history.length;if(redo)redo.disabled=!future.length;
  updatePull();
}
function updateView(){
  const world=$('#world');if(world)world.style.transform=`translate(${view.x}px,${view.y}px) scale(${view.scale})`;
  const z=$('#zoom-value');if(z)z.textContent=Math.round(view.scale*100)+'%';
}
function fitView(nodes=null,overview=false){
  const surface=$('#surface');if(!surface)return;const r=surface.getBoundingClientRect(),b=boundsOf(nodes||visibleNodes(p,{focusId,showHidden}));
  const top=108+(showShelf?258:0),bottom=176,left=showOutline?270:38,right=38;
  const scale=Math.min(1.05,Math.max(overview?0.25:0.75,Math.min((r.width-left-right)/(b.width+55),(r.height-top-bottom)/(b.height+45))));
  view={scale,x:left+(r.width-left-right)/2-(b.x+b.width/2)*scale,y:top+(r.height-top-bottom)/2-(b.y+b.height/2)*scale};updateView();
}
function centerNode(id){const n=p.nodes.find(v=>v.id===id),r=$('#surface').getBoundingClientRect();if(!n)return;view.x=r.width/2-(n.x+CARD.width/2)*view.scale;view.y=(r.height-100)/2-(n.y+CARD.height/2)*view.scale;updateView();}
function zoomBy(factor,point=null){const r=$('#surface').getBoundingClientRect(),x=point?.x??r.width/2,y=point?.y??r.height/2;const next=Math.max(0.28,Math.min(1.75,view.scale*factor));view.x=x-(x-view.x)*next/view.scale;view.y=y-(y-view.y)*next/view.scale;view.scale=next;updateView();}
function drawNodePanel(){
  const panel=$('#node-panel');if(!panel)return;
  if(!fanPinned)$$('.idea-card.fan-pinned').forEach(el=>el.classList.remove('fan-pinned'));
  if(menu!=='node'||!selected){panel.hidden=true;$$('.idea-card.menu-open').forEach(el=>el.classList.remove('menu-open'));return;}
  const n=current();panel.hidden=false;panel.innerHTML=`<div class="panel-heading"><span class="eyebrow">${KINDS[n.kind].label}</span>${iconButton('关闭卡片操作','close-menu','',{symbol:'×'})}</div><h2>${esc(n.title)}</h2><p class="panel-description">${esc(n.description)}</p><div class="panel-reason"><span>与上层的关联</span><p>${esc(n.rationale)}</p></div><div class="panel-secondary">${button('编辑内容与理由','edit',{id:n.id})}${button('完整路径','details',{id:n.id})}${n.kind!=='root'?button('指定上层','assign',{id:n.id}):''}${n.kind!=='root'?button('关联同类卡片','connect',{id:n.id}):''}</div>${n.kind!=='root'?`<div class="panel-bottom">${button(n.hidden?'恢复显示':'隐藏分支','hide',{id:n.id})}${button('只显示此分支','focus',{id:n.id})}${button('删除','delete-node',{id:n.id,class:'danger-text'})}</div>`:''}`;
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
  showShelf=!showShelf;savedSelection.clear();fanPinned=null;menu=null;
  $('.workspace')?.classList.toggle('with-shelf',showShelf);
  const backdrop=$('.collection-backdrop');backdrop?.classList.toggle('is-open',showShelf);if(backdrop)backdrop.inert=!showShelf;
  const shelf=$('#shelf');shelf?.classList.toggle('is-open',showShelf);if(shelf)shelf.inert=!showShelf;
  updatePull();drawShelf();drawNodePanel();
}
function drawShelf(){
  const shelf=$('#shelf');if(!shelf)return;
  shelf.innerHTML=`<div class="shelf-heading"><div><h2>收藏的方向 <span>${p.favorites.length}</span></h2></div><div>${savedSelection.size?button('导出选中 '+savedSelection.size+' 项','export-saved'):''}</div></div><div class="shelf-rope"></div><div class="saved-cards">${p.favorites.length?p.favorites.map((f,i)=>`<article class="saved-card type-${f.kind}" data-saved-card="${f.id}" style="--turn:${[-1.2,1,-.6,.8][i%4]}deg;--hang-delay:${i*35}ms"><label class="saved-check"><input type="checkbox" data-saved-check="${f.id}" ${savedSelection.has(f.id)?'checked':''} aria-label="选择方向：${esc(f.title)}"></label><button data-action="saved-detail" data-id="${f.id}"><span class="saved-kicker">${KINDS[f.kind].label}</span><h3>${esc(f.title)}</h3><p>${esc(f.description)}</p></button></article>`).join(''):'<div class="shelf-empty">暂无收藏</div>'}</div>`;
}
function drawOutline(){
  const el=$('#outline');if(!el)return;
  const walk=(node,depth=0,seen=new Set())=>{if(seen.has(node.id))return '';const next=new Set(seen);next.add(node.id);return `<div class="outline-item ${node.id===selected?'selected':''}" style="--depth:${Math.min(depth,6)}"><button data-action="locate" data-id="${node.id}"><span class="outline-dot kind-${node.kind}"></span><span>${esc(node.title)}</span>${node.merged?'<span class="outline-merge">∩</span>':''}</button></div>`+p.nodes.filter(n=>n.parentIds[0]===node.id).map(n=>walk(n,depth+1,next)).join('');};
  el.innerHTML=`<div class="outline-heading"><span>探索路径</span>${iconButton('收起探索路径','outline','',{symbol:'×'})}</div>${walk(rootOf(p))}${p.nodes.filter(n=>n.kind!=='root'&&!n.parentIds.length).length?'<div class="outline-independent">独立想法</div>':''}${p.nodes.filter(n=>n.kind!=='root'&&!n.parentIds.length).map(n=>walk(n)).join('')}`;
}
function updateNotices(){
  const notice=$('#selection-notice'),progress=$('#generation-progress');
  if(!notice||!progress)return;
  if(assigning||connecting){notice.hidden=false;const n=p.nodes.find(v=>v.id===(assigning||connecting));notice.innerHTML=`<span>${assigning?`为“${esc(n?.title)}”选择上层节点`:`为“${esc(n?.title)}”选择另一张${KINDS[n?.kind]?.label||''}卡片，提取交集`}</span>${button('取消','cancel-selection')}`;}else notice.hidden=true;
  if(pending){progress.hidden=false;progress.innerHTML=`<span class="spinner"></span><span>${esc(pending.label)}</span>${button('取消','cancel-generation')}`;}else progress.hidden=true;
}
function openProject(project){
  pending?.controller.abort();pending=null;p=project;screen='workspace';selected=rootOf(p).id;menu=null;fanPinned=null;focusId=null;showShelf=false;showOutline=false;showHidden=false;history=[];future=[];search='';assigning=null;connecting=null;manualDraft='';render();requestAnimationFrame(()=>fitView());
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
  openProject(project);selected=project.nodes.find(n=>n.kind==='scene').id;drawGraph();toast('这是预置示例。继续生成时会使用你配置的真实 AI。');
}
async function generate(parentId,kind){
  if(pending)return toast('请等待这次生成完成，或先取消。');
  if(model.mode!=='live'){queuedAfterModel=()=>generate(parentId,kind);openModal('model');return;}
  const node=p.nodes.find(n=>n.id===parentId);if(!node)return;
  const projectId=p.id,controller=new AbortController();pending={controller,label:`沿着“${node.title.slice(0,18)}”生成 ${p.generationCount} 张${KINDS[kind].label}…`};menu=null;drawNodePanel();updateNotices();
  try{
    const result=await api('/generate',{operation:'expand',project:{title:p.title,description:p.description,context:p.context},node,ancestors:ancestorsOf(p,node.id),targetKind:kind,count:p.generationCount,exclude:p.nodes.filter(n=>n.parentIds.includes(node.id)&&n.kind===kind).map(n=>n.title)},controller.signal);
    if(controller.signal.aborted||p?.id!==projectId)return;
    if(!result.nodes.length)throw new Error(result.message||'模型没有给出可用候选，可以调整条件后重试。');
    let created;commit(()=>created=appendGenerated(p,parentId,kind,result.nodes,'live'));selected=created[0].id;menu=null;drawGraph();fitView();centerNode(selected);toast(`已生成 ${created.length} 个${KINDS[kind].label}候选，每个都保留了上层关联。`);
  }catch(error){if(error.name!=='AbortError')toast(error.message,'error');}finally{if(pending?.controller===controller)pending=null;updateNotices();}
}
async function combine(aId,bId){
  if(pending)return toast('请等待这次生成完成，或先取消。');
  const a=p.nodes.find(n=>n.id===aId),b=p.nodes.find(n=>n.id===bId);
  if(!a||!b||a.id===b.id||a.kind!==b.kind||a.kind==='root')return toast('只能关联两张不同的同类卡片。','error');
  connecting=null;assigning=null;
  if(model.mode!=='live'){queuedAfterModel=()=>combine(aId,bId);openModal('model');drawGraph();return;}
  const projectId=p.id,controller=new AbortController();pending={controller,label:'正在提取两张卡片的共同点或交集…'};drawGraph();
  try{
    const result=await api('/generate',{operation:'merge',project:{title:p.title,description:p.description,context:p.context},nodes:[a,b],ancestors:[ancestorsOf(p,aId),ancestorsOf(p,bId)]},controller.signal);
    if(controller.signal.aborted||p?.id!==projectId)return;
    if(!result.nodes.length){toast(result.message||'没有找到合理交集，原卡片已保留。');return;}
    let node;commit(()=>node=mergeNodes(p,aId,bId,result.nodes[0],'live'));selected=node.id;drawGraph();fitView();centerNode(selected);toast('已生成交集卡片，两个来源均已保留。');
  }catch(error){if(error.name!=='AbortError')toast(error.message,'error');}finally{if(pending?.controller===controller)pending=null;updateNotices();}
}
function addManualCard(e){
  e?.preventDefault();if(!manualDraft.trim())return $('#manual-text').focus();
  const r=$('#surface').getBoundingClientRect(),position={x:(r.width/2-view.x)/view.scale-CARD.width/2,y:(r.height/2-view.y)/view.scale-CARD.height/2};let n;
  commit(()=>n=appendManual(p,null,manualKind,manualDraft.trim(),'',position));selected=n.id;manualDraft='';$('#manual-text').value='';drawGraph();centerNode(n.id);menu='node';drawNodePanel();toast('已添加独立卡片，可在卡片操作中“指定上层”。');
}
function selectNode(id){
  const node=p.nodes.find(n=>n.id===id);if(!node)return;
  if(assigning){try{const moving=assigning;commit(()=>assignParent(p,moving,id));assigning=null;selected=moving;menu=null;drawGraph();toast('已指定上层，完整路径已更新。');}catch(e){toast(e.message,'error');}return;}
  if(connecting){if(connecting===id)return;combine(connecting,id);return;}
  selected=id;menu=null;fanPinned=matchMedia('(hover: none)').matches?id:null;drawGraph();$(`[data-node="${id}"]`)?.focus({preventScroll:true});
}
function bindCanvas(){
  const surface=$('#surface');
  surface.addEventListener('wheel',event=>{if(event.target.closest('.node-panel,.manual-dock,.shelf'))return;event.preventDefault();const rect=surface.getBoundingClientRect();if(event.ctrlKey||event.metaKey||Math.abs(event.deltaY)>Math.abs(event.deltaX)*1.5)zoomBy(Math.exp(-event.deltaY*0.0017),{x:event.clientX-rect.left,y:event.clientY-rect.top});else{view.x-=event.deltaX;view.y-=event.deltaY;updateView();}},{passive:false});
  surface.addEventListener('pointerdown',event=>{
    if(event.button!==0&&event.button!==1)return;
    const handle=event.target.closest('[data-handle]'),nodeEl=event.target.closest('[data-node]');
    if(handle){event.preventDefault();event.stopPropagation();connecting=handle.dataset.handle;assigning=null;fanPinned=null;menu=null;drag={type:'link',id:connecting,startX:event.clientX,startY:event.clientY,moved:false};surface.setPointerCapture(event.pointerId);drawGraph();return;}
    if(event.target.closest('button,[data-edge]')&&!spaceHeld&&tool!=='hand')return;
    if(nodeEl&&!spaceHeld&&tool!=='hand'&&event.button!==1){const n=p.nodes.find(v=>v.id===nodeEl.dataset.node);drag={type:'node',id:n.id,startX:event.clientX,startY:event.clientY,x:n.x,y:n.y,moved:false,before:clone(p)};}
    else{drag={type:'pan',startX:event.clientX,startY:event.clientY,x:view.x,y:view.y,moved:false};surface.classList.add('is-panning');}
    event.preventDefault();
  });
  surface.addEventListener('dblclick',event=>{if(event.target.closest('[data-node],button,[data-edge]'))return;$('#manual-text').focus();});
}
document.addEventListener('pointerdown',event=>{
  const pull=event.target.closest('.shelf-pull');if(!pull||event.button!==0)return;
  cordDrag={startY:event.clientY,wasOpen:showShelf,pull};pull.setPointerCapture(event.pointerId);
});
document.addEventListener('pointermove',event=>{
  if(cordDrag){const delta=event.clientY-cordDrag.startY;if(Math.abs(delta)>5){cordDrag.pull.classList.add('is-dragging');cordDrag.pull.style.setProperty('--cord-offset',Math.max(-30,Math.min(30,delta))+'px');}return;}
  if(!drag)return;const dx=event.clientX-drag.startX,dy=event.clientY-drag.startY;if(Math.hypot(dx,dy)>4)drag.moved=true;
  if(drag.type==='pan'){view.x=drag.x+dx;view.y=drag.y+dy;updateView();}
  if(drag.type==='node'&&drag.moved){const n=p.nodes.find(v=>v.id===drag.id);n.x=drag.x+dx/view.scale;n.y=drag.y+dy/view.scale;const el=$(`[data-node="${n.id}"]`);if(el){el.style.left=n.x+'px';el.style.top=n.y+'px';}updateEdgePositions();}
  if(drag.type==='link'){
    const n=p.nodes.find(v=>v.id===drag.id),rect=$('#surface').getBoundingClientRect(),x=(event.clientX-rect.left-view.x)/view.scale,y=(event.clientY-rect.top-view.y)/view.scale;
    const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-node]'),candidate=p.nodes.find(v=>v.id===target?.dataset.node),valid=candidate&&candidate.id!==n.id&&candidate.kind===n.kind;
    $$('.idea-card.drop-target').forEach(el=>el.classList.remove('drop-target'));if(valid)target.classList.add('drop-target');
    const startX=n.x+CARD.width+28;
    $('#link-preview').innerHTML=`<path d="M ${startX} ${n.y+CARD.height/2} C ${startX+70} ${n.y+CARD.height/2},${x-70} ${y},${x} ${y}" fill="none" stroke="${candidate&&!valid?'#c88c83':'#007AFF'}" stroke-width="2.5"></path><circle cx="${x}" cy="${y}" r="4" fill="#007AFF"></circle>`;
  }
});
document.addEventListener('pointerup',event=>{
  if(cordDrag){const old=cordDrag,delta=event.clientY-old.startY;cordDrag=null;old.pull.classList.remove('is-dragging');old.pull.style.removeProperty('--cord-offset');if(Math.abs(delta)>12){suppressCordClick=true;setTimeout(()=>suppressCordClick=false,0);if((!old.wasOpen&&delta>12)||(old.wasOpen&&delta< -12))toggleShelf();}return;}
  if(!drag)return;const old=drag;drag=null;$('#surface')?.classList.remove('is-panning');
  if(old.type==='node'){if(old.moved){history.push(old.before);future=[];persist();}else selectNode(old.id);}
  if(old.type==='pan'&&!old.moved){if(!event.target.closest('[data-node],[data-edge]')){menu=null;fanPinned=null;$$('.fan-pinned').forEach(el=>el.classList.remove('fan-pinned'));drawNodePanel();}}
  if(old.type==='link'){$('#link-preview').innerHTML='';const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-node]');if(old.moved){connecting=null;drawGraph();if(target&&target.dataset.node!==old.id)combine(old.id,target.dataset.node);}else{connecting=old.id;drawGraph();}}
});
function updateEdgePositions(){
  for(const group of $$('.edge-group')){const edge=p.edges.find(e=>e.id===group.dataset.edge),a=p.nodes.find(n=>n.id===edge.from),b=p.nodes.find(n=>n.id===edge.to),c=curve(a,b);$$('path',group).forEach(path=>path.setAttribute('d',c.d));$('.edge-label',group).setAttribute('transform',`translate(${c.mx},${c.my})`);}
}
document.addEventListener('pointercancel',()=>{if(cordDrag){cordDrag.pull.classList.remove('is-dragging');cordDrag.pull.style.removeProperty('--cord-offset');cordDrag=null;}if(drag){drag=null;connecting=null;$('#surface')?.classList.remove('is-panning');if($('#link-preview'))$('#link-preview').innerHTML='';if(screen==='workspace')drawGraph();}});
document.addEventListener('click',event=>{
  const action=event.target.closest('[data-action]');if(action){event.stopPropagation();if(action.dataset.action==='shelf'&&suppressCordClick){suppressCordClick=false;return;}dispatch(action.dataset.action,action);return;}
  const edge=event.target.closest('[data-edge]');if(edge){const e=p.edges.find(v=>v.id===edge.dataset.edge);openModal('edge',e);}
});
document.addEventListener('change',event=>{if(event.target.matches('[data-saved-check]')){const id=event.target.dataset.savedCheck;event.target.checked?savedSelection.add(id):savedSelection.delete(id);drawShelf();}});
function dispatch(action,el){
  const id=el?.dataset.id;
  try{switch(action){
    case'home':pending?.controller.abort();pending=null;persist();screen='home';modal=null;overlays.innerHTML='';render();break;
    case'new-project':openModal('new-project');break;
    case'open-project':openProject(projects.find(v=>v.id===id));break;
    case'delete-project':openModal('delete-project',id);break;
    case'import':$('#file-import').click();break;
    case'demo':openDemo();break;
    case'help':openModal('help');break;
    case'model':openModal('model');break;
    case'project-settings':openModal('project-settings');break;
    case'shelf':toggleShelf();break;
    case'outline':showOutline=!showOutline;renderWorkspace();break;
    case'tool-select':tool='select';renderWorkspace();break;
    case'tool-hand':tool='hand';renderWorkspace();break;
    case'fit':fitView(null,true);break;
    case'zoom-in':zoomBy(1.16);break;
    case'zoom-out':zoomBy(1/1.16);break;
    case'undo':if(history.length){future.push(clone(p));p=history.pop();if(!p.nodes.some(n=>n.id===selected))selected=rootOf(p).id;if(!p.nodes.some(n=>n.id===focusId))focusId=null;assigning=null;connecting=null;persist();renderWorkspace();toast('已撤销');}break;
    case'redo':if(future.length){history.push(clone(p));p=future.pop();if(!p.nodes.some(n=>n.id===selected))selected=rootOf(p).id;if(!p.nodes.some(n=>n.id===focusId))focusId=null;assigning=null;connecting=null;persist();renderWorkspace();toast('已重做');}break;
    case'count':p.generationCount=Number(el.dataset.count);persist();renderWorkspace();break;
    case'node-menu':{const same=selected===id;selected=id;fanPinned=null;menu=menu==='node'&&same?null:'node';drawGraph();break;}
    case'close-menu':menu=null;drawNodePanel();break;
    case'expand':fanPinned=null;generate(id,el.dataset.kind);break;
    case'expand-same':{const n=p.nodes.find(v=>v.id===id);selected=id;if(n.kind==='root'){menu=null;fanPinned=fanPinned===id?null:id;drawGraph();}else generate(id,n.kind);break;}
    case'favorite':{let result;commit(()=>result=favoriteNode(p,id));drawGraph();toast(result?'已留下这个方向，完整路径和理由也一起保存了。':'已取消收藏');break;}
    case'edit':openModal('edit',p.nodes.find(n=>n.id===id));break;
    case'details':openModal('node-detail',p.nodes.find(n=>n.id===(id||selected)));break;
    case'assign':assigning=id;connecting=null;menu=null;drawGraph();break;
    case'connect':connecting=id;assigning=null;menu=null;drawGraph();break;
    case'cancel-selection':assigning=null;connecting=null;drawGraph();break;
    case'cancel-generation':pending?.controller.abort();break;
    case'locate':if(assigning||connecting){selectNode(id);centerNode(id);}else{selected=id;menu=null;drawGraph();centerNode(id);}break;
    case'focus':focusId=id;selected=id;menu=null;renderWorkspace();fitView();break;
    case'unfocus':focusId=null;renderWorkspace();fitView();break;
    case'toggle-hidden':showHidden=!showHidden;renderWorkspace();break;
    case'hide':commit(()=>{const n=p.nodes.find(n=>n.id===id);n.hidden=!n.hidden;});if(current().id===id&&current().hidden)selected=rootOf(p).id;menu=null;drawGraph();toast('显示状态已更新，可通过“显示已收起”恢复。');break;
    case'delete-node':openModal('delete-node',id);break;
    case'saved-detail':openModal('saved-detail',p.favorites.find(f=>f.id===id));break;
    case'return-to-card':closeModal();showShelf=false;renderWorkspace();selected=id;drawGraph();centerNode(id);break;
    case'export':openModal('export');break;
    case'export-saved':openModal('export',true);break;
    case'share':openModal('share');break;
    case'close-modal':closeModal();break;
    case'download-json':download(JSON.stringify(p,null,2),p.title+'.json','application/json');toast('项目已导出，可重新打开继续探索。');break;
    case'download-md':download(selectedMarkdown(),p.title+'.md','text/markdown;charset=utf-8');toast('方向与细化理由已导出。');break;
    case'download-png':exportPng();break;
    case'print':printProject();break;
    case'copy-share':copyShare();break;
    case'clear-model':api('/model/clear',{}).then(()=>{model={mode:'unconfigured'};closeModal();updateModelBadge();toast('已清除本次模型配置。');});break;
    case'copy-direction':{const saved=p.favorites.find(f=>f.id===id);copyText(toMarkdown(p,saved));break;}
    case'remove-saved':commit(()=>p.favorites=p.favorites.filter(f=>f.id!==id));closeModal();drawShelf();drawGraph();break;
  }}catch(error){toast(error.message,'error');}
}
function modalShell(title,body,footer='',wide=false){return `<div class="modal-backdrop"><section class="modal ${wide?'modal-wide':''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header class="modal-header"><div><span class="modal-eyebrow">有点想法</span><h2>${esc(title)}</h2></div>${iconButton('关闭','close-modal','',{symbol:'×'})}</header>${body}${footer?`<footer class="modal-footer">${footer}</footer>`:''}</section></div>`;}
function pathMarkup(snapshot){return snapshot.paths.map(path=>`<ol class="detail-path">${path.map(id=>{const n=snapshot.nodes.find(n=>n.id===id);return n?`<li>${chip(n.kind)}<strong>${esc(n.title)}</strong><p>${esc(n.rationale||'最初的想法')}</p></li>`:'';}).join('')}</ol>`).join('');}
const motionDuration=value=>matchMedia('(prefers-reduced-motion: reduce)').matches?0:value;
function releaseDirection(state){state?.flightAnimation?.cancel();state?.turnAnimation?.cancel();state?.source?.classList.remove('is-in-flight');}
function flightTransform(rect,target){return `translate(${rect.left-target.left}px, ${rect.top-target.top}px) scale(${rect.width/target.width}, ${rect.height/target.height})`;}
function openDirection(data){
  const source=$(`[data-saved-card="${data.id}"]`),width=Math.min(660,innerWidth-32),height=Math.min(690,innerHeight-48),target={left:(innerWidth-width)/2,top:(innerHeight-height)/2,width,height};
  const rect=source?.getBoundingClientRect()||{left:innerWidth/2-110,top:120,width:220,height:126};
  lastFocus=document.activeElement;const state={kind:'saved-detail',data,source,rect,target,closing:false};modal=state;
  const footer=button('取消收藏','remove-saved',{id:data.id,class:'danger-text'})+button('复制方向','copy-direction',{id:data.id})+(p.nodes.some(n=>n.id===data.nodeId)?button('回到画布','return-to-card',{id:data.nodeId,class:'primary'}):'');
  overlays.innerHTML=`<div class="modal-backdrop direction-backdrop"><div class="direction-flight" style="left:${target.left}px;top:${target.top}px;width:${width}px;height:${height}px"><div class="direction-turn"><div class="direction-front type-${data.kind}" aria-hidden="true"><span class="direction-front-clip"></span><span class="saved-kicker">${KINDS[data.kind].label} · 已收藏</span><h2>${esc(data.title)}</h2><p>${esc(data.description)}</p><span class="direction-front-foot">路径与细化理由，保存在背面</span></div><section class="modal direction-back" role="dialog" aria-modal="true" aria-label="${esc(data.title)}"><header class="modal-header"><div><span class="modal-eyebrow">收藏的方向 · 背面</span><h2>${esc(data.title)}</h2></div>${iconButton('翻回并收起','close-modal','',{symbol:'×'})}</header><div class="direction-content"><div class="saved-detail-intro">${chip(data.kind)}<span>收藏于 ${new Date(data.createdAt).toLocaleString('zh-CN')}</span></div><p class="detail-description">${esc(data.description)}</p><div class="detail-reason"><span>这一步为什么值得留下</span><p>${esc(data.rationale)}</p></div><h3 class="detail-section-title">从最初的想法，到这里</h3>${pathMarkup(data.snapshot)}<div class="detail-footnote">这是收藏时的完整路径快照。</div></div><footer class="modal-footer">${footer}</footer></section></div></div></div>`;
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
  if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});else $('#surface')?.focus({preventScroll:true});
}
function openModal(kind,data=null){
  if(modal?.kind==='saved-detail')releaseDirection(modal);
  menu=null;fanPinned=null;drawNodePanel();
  if(kind==='saved-detail'){openDirection(data);return;}
  lastFocus=document.activeElement;modal={kind,data};let body='',footer='',title='',wide=false;
  if(kind==='new-project'){
    title='从一点好奇开始';body=`<p class="modal-intro">一个模糊兴趣、一段日常观察，或者一份作业要求，都可以。</p><form id="new-project-form"><label class="field"><span>你想探索什么？</span><textarea id="project-description" rows="5" maxlength="2000" required placeholder="例如：我想探索人与城市的关系，做一个让公共空间更有余地的交互设计项目。"></textarea></label><label class="field"><span>给这次探索起个名字 <em>选填</em></span><input id="project-name" maxlength="50" placeholder="我的下一点想法"></label><div class="form-actions">${button('取消','close-modal')}<button type="submit" class="button primary">创建选题中心 ${icon('arrow')}</button></div></form>`;
  }
  if(kind==='model'){
    const deepseek=model.provider==='deepseek'||!model.baseUrl||model.baseUrl.includes('api.deepseek.com');
    const existingName=/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(model.model||'')||/^sk[-_]/.test(model.model||'')?'':model.model;
    const choices=model.models?.length?model.models:[{id:'deepseek-flash'},{id:'deepseek-v4-pro'}];
    title='连接你的 AI';body=`<form id="model-form"><label class="field"><span>模型服务</span><select id="model-provider"><option value="deepseek" ${deepseek?'selected':''}>DeepSeek 官方</option><option value="custom" ${deepseek?'':'selected'}>其他兼容服务</option></select></label><label class="field"><span>API 地址</span><input id="model-url" type="url" required value="${esc(model.baseUrl||'https://api.deepseek.com')}" placeholder="https://api.deepseek.com"></label><label class="field"><span>API Key · 密钥</span><input id="model-key" type="password" ${model.hasKey?'':'required'} placeholder="${model.hasKey?'已保存在本次会话，留空保留':'填写你的 API Key'}" autocomplete="off"></label><label class="field"><span>模型 ID</span><div class="model-choice-row"><input id="model-name" list="available-models" required value="${esc(existingName||(deepseek?'deepseek-flash':''))}" placeholder="从可用模型中选择" autocomplete="off"><button type="button" class="button" id="load-models">读取可用模型</button></div><datalist id="available-models">${choices.map(v=>`<option value="${esc(v.id)}">${esc(v.name||v.id)}</option>`).join('')}</datalist><small id="model-list-note">这里填写模型名称，不是 API Key 或账户标识。</small></label><div class="model-local-note">${icon('lock')}<p>密钥仅保存在本地服务内存。生成时，当前分支与项目背景发送给你配置的服务。</p></div><p class="form-error" id="model-error" role="alert" hidden></p><div class="form-actions">${model.mode==='live'?button('清除配置','clear-model',{class:'danger-text'}):button('取消','close-modal')}<button type="submit" class="button primary" id="save-model">${queuedAfterModel?'验证并继续生成':deepseek?'保存并验证':'保存配置'}</button></div></form>`;
  }
  if(kind==='edit'){
    title='编辑这个想法';body=`<form id="edit-form"><label class="field"><span>想法标题</span><input id="edit-title" value="${esc(data.title)}" maxlength="90" required></label><label class="field"><span>补充说明</span><textarea id="edit-description" rows="3" maxlength="1600">${esc(data.description)}</textarea></label><label class="field"><span>为什么从上层想法发展到这里？</span><textarea id="edit-rationale" rows="3" maxlength="1600">${esc(data.rationale)}</textarea></label><p class="field-hint">已经收藏的方向保留当时快照，编辑不会覆盖收藏内容。</p><div class="form-actions">${button('取消','close-modal')}<button type="submit" class="button primary">保存修改</button></div></form>`;
  }
  if(kind==='project-settings'){
    title='这次探索的背景';body=`<form id="context-form"><label class="field"><span>项目名称</span><input id="context-title" value="${esc(p.title)}" maxlength="50" required></label><div class="original-idea"><span>最初的粗想法</span><p>${esc(p.description)}</p></div><label class="field"><span>补充条件与背景</span><textarea id="context-text" rows="5" maxlength="3000" placeholder="例如：交互设计课程，四周完成，方便访谈在校学生。">${esc(p.context)}</textarea><small>新的条件用于后续生成，已生成的卡片会保留。</small></label><div class="form-actions">${button('取消','close-modal')}<button type="submit" class="button primary">保存背景</button></div></form>`;
  }
  if(kind==='node-detail'){
    title=data.title;wide=true;const paths=getPaths(p,data.id),nodes=ancestorsOf(p,data.id);body=`${chip(data.kind)}<p class="detail-description">${esc(data.description)}</p><h3 class="detail-section-title">完整探索路径</h3>${pathMarkup({nodes,paths:paths.map(path=>path.map(n=>n.id))})}<div class="detail-footnote">${data.origin==='demo'?'此卡片是预置示例内容。':data.origin==='manual'?'此卡片由你手动补充。':'此卡片由你配置的模型生成，内容仍需验证。'}</div>`;footer=button('关闭','close-modal')+button('编辑内容与理由','edit',{id:data.id,class:'primary'});
  }
  if(kind==='edge'){
    title='这两个想法为什么相连';const a=p.nodes.find(n=>n.id===data.from),b=p.nodes.find(n=>n.id===data.to);body=`<div class="edge-detail"><div>${chip(a.kind)}<strong>${esc(a.title)}</strong></div><span class="edge-detail-arrow">↓ ${esc(data.relation)}</span><div>${chip(b.kind)}<strong>${esc(b.title)}</strong></div></div><div class="detail-reason"><span>关联理由</span><p>${esc(data.rationale||b.rationale)}</p></div>`;footer=button('关闭','close-modal')+button('查看下层卡片','return-to-card',{id:b.id,class:'primary'});
  }
  if(kind==='export'){
    title=data?'导出选中的方向':'把想法带走';body=`<p class="modal-intro">${data?`将选中的 ${savedSelection.size} 个方向及其路径导出。`:'保存完整探索，或把选题方向交给下一步工作。'}</p><div class="export-options">${data?'':`<button data-action="download-json">${icon('branch')}<div><strong>项目文件</strong><span>JSON · 包含画布、连线、收藏，可重新打开</span></div>${icon('arrow')}</button>`}<button data-action="download-md">${icon('file')}<div><strong>方向说明</strong><span>Markdown · 保留内容、上游路径与细化理由</span></div>${icon('arrow')}</button>${data?'':`<button data-action="download-png">${icon('scene')}<div><strong>画布图片</strong><span>PNG · 导出当前可见的探索结构</span></div>${icon('arrow')}</button><button data-action="print">${icon('file')}<div><strong>保存为 PDF</strong><span>打开打印预览，选择“存储为 PDF”</span></div>${icon('arrow')}</button>`}</div>`;footer=button('关闭','close-modal');
  }
  if(kind==='share'){
    title='分享这次探索';body=`<p class="modal-intro">把当前探索保存为链接快照。接收者打开后，会获得一份可独立编辑的副本。</p><div class="original-idea"><strong>${esc(p.title)}</strong><p>${p.nodes.length} 个想法 · ${p.favorites.length} 个已收藏方向</p></div><p class="field-hint">原型运行在本地。接收者需要能够访问同一个网页服务；跨设备分享也可以先导出项目文件。</p>`;footer=button('导出项目文件','download-json')+button('复制链接','copy-share',{class:'primary'});
  }
  if(kind==='help'){
    title='让想法一步步长出来';body=`<div class="help-steps"><div><span>1</span><section><h3>从一个粗想法开始</h3><p>输入兴趣、观察或作业要求，建立选题中心。</p></section></div><div><span>2</span><section><h3>选择卡片，换个维度看</h3><p>从场景、痛点、人群继续探索。卡片加号会细化相同类型。</p></section></div><div><span>3</span><section><h3>连接同类，寻找交集</h3><p>从右侧连接点拖到另一张同类卡片，也可以在操作面板点击“关联同类卡片”。</p></section></div><div><span>4</span><section><h3>留下方向，也留下来路</h3><p>点击星标，收藏节点、全部上游路径和细化理由。</p></section></div></div><div class="detail-footnote">拖动空白处平移，滚轮缩放。⌘Z 撤销，⌘⇧Z 重做，⌘K 搜索。独立卡片可通过“指定上层”建立归属。</div>`;footer=button('知道了','close-modal',{class:'primary'});
  }
  if(kind==='delete-node'||kind==='delete-project'){
    title=kind==='delete-node'?'删除这条分支？':'删除这个项目？';body=`<p class="modal-intro">${kind==='delete-node'?'会一并删除只属于它的子节点。已经收藏的路径快照会保留，也可以通过撤销恢复。':'会从这台设备的最近探索中删除。建议先导出项目文件。'}</p>`;footer=button('取消','close-modal')+`<button class="button destructive" id="confirm-delete">确认删除</button>`;
  }
  overlays.innerHTML=modalShell(title,body,footer,wide);bindModal(kind,data);requestAnimationFrame(()=>($('.modal input,.modal textarea')||$('.modal button'))?.focus());
}
function closeModal(){if(modal?.kind==='saved-detail'){closeDirection(modal);return;}if(modal?.kind==='model')queuedAfterModel=null;modal=null;overlays.innerHTML='';if(lastFocus?.isConnected)lastFocus.focus();else if(screen==='workspace')$('#surface')?.focus({preventScroll:true});}
function bindModal(kind,data){
  $('.modal-backdrop').addEventListener('click',e=>{if(e.target===e.currentTarget)closeModal();});
  $('#new-project-form')?.addEventListener('submit',e=>{e.preventDefault();const description=$('#project-description').value.trim();if(!description)return;const project=createProject(description,$('#project-name').value);projects.unshift(project);closeModal();openProject(project);persist();fanPinned=rootOf(p).id;drawGraph();toast('选题中心已建立。悬停卡片，从上方选择细化维度。');});
  const connectionInput=()=>({baseUrl:$('#model-url').value.trim(),provider:$('#model-provider').value,model:$('#model-name').value.trim(),apiKey:$('#model-key').value});
  $('#model-provider')?.addEventListener('change',()=>{const deepseek=$('#model-provider').value==='deepseek';$('#model-url').value=deepseek?'https://api.deepseek.com':model.provider==='custom'?model.baseUrl:'';$('#model-name').value=deepseek?'deepseek-flash':model.provider==='custom'?model.model:'';$('#model-key').required=!model.hasKey;$('#save-model').textContent=queuedAfterModel?'验证并继续生成':deepseek?'保存并验证':'保存配置';});
  $('#load-models')?.addEventListener('click',async()=>{const load=$('#load-models'),error=$('#model-error');load.disabled=true;load.textContent='正在读取…';error.hidden=true;try{const result=await api('/models',connectionInput());$('#available-models').innerHTML=result.models.map(v=>`<option value="${esc(v.id)}">${esc(v.name||v.id)}</option>`).join('');if(!result.models.some(v=>v.id===$('#model-name').value))$('#model-name').value=result.models[0].id;$('#model-list-note').textContent=`已读取 ${result.models.length} 个可用模型，可在输入框中选择。`;}catch(err){error.hidden=false;error.textContent=err.message;}finally{load.disabled=false;load.textContent='读取可用模型';}});
  $('#model-form')?.addEventListener('submit',async e=>{e.preventDefault();const submit=$('#save-model'),error=$('#model-error');submit.disabled=true;submit.textContent='正在验证…';error.hidden=true;try{model=await api('/model',connectionInput());const work=queuedAfterModel;closeModal();updateModelBadge();toast(model.verified?'已验证模型名称，配置已保存。':'模型配置已保存。');work?.();}catch(err){error.hidden=false;error.textContent=err.message;submit.disabled=false;submit.textContent='重试保存';}});
  $('#edit-form')?.addEventListener('submit',e=>{e.preventDefault();const title=$('#edit-title').value.trim(),description=$('#edit-description').value.trim(),rationale=$('#edit-rationale').value.trim();if(!title)return;commit(()=>{const node=p.nodes.find(n=>n.id===data.id);Object.assign(node,{title,description,rationale});p.edges.filter(e=>e.to===node.id).forEach(e=>e.rationale=rationale);});closeModal();drawGraph();toast('想法与关联理由已更新。');});
  $('#context-form')?.addEventListener('submit',e=>{e.preventDefault();const title=$('#context-title').value.trim(),context=$('#context-text').value.trim();commit(()=>Object.assign(p,{title,context}));closeModal();renderWorkspace();toast('背景已保存，后续生成会使用这些条件。');});
  $('#confirm-delete')?.addEventListener('click',()=>{if(kind==='delete-node'){commit(()=>removeBranch(p,data));if(!p.nodes.some(n=>n.id===focusId))focusId=null;selected=rootOf(p).id;closeModal();renderWorkspace();toast('已删除分支，可以撤销恢复。');}else{projects=projects.filter(v=>v.id!==data);p=null;persist();closeModal();renderHome();}});
}
document.addEventListener('keydown',e=>{
  if(modal&&e.key==='Tab'){const items=$$('button:not([disabled]),input,textarea,select,[tabindex="0"]',$('.modal')),first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}return;}
  if(e.key==='Escape'){if(modal){closeModal();queuedAfterModel=null;}else if(showShelf){toggleShelf();}else{menu=null;fanPinned=null;connecting=null;assigning=null;if(focusId){focusId=null;renderWorkspace();}else if(screen==='workspace')drawGraph();}return;}
  const editing=/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
  if((e.metaKey||e.ctrlKey)&&e.key==='Enter'&&document.activeElement?.id==='manual-text'){e.preventDefault();addManualCard();return;}
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'&&screen==='workspace'){e.preventDefault();$('#node-search').focus();return;}
  if(editing||modal)return;
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'&&p){e.preventDefault();dispatch(e.shiftKey?'redo':'undo');return;}
  if(e.code==='Space'&&screen==='workspace'){spaceHeld=true;e.preventDefault();$('#surface').classList.add('space-pan');}
  if(e.key==='Enter'&&document.activeElement?.matches('[data-node]')){e.preventDefault();selectNode(document.activeElement.dataset.node);}
  if(e.key==='Enter'&&document.activeElement?.matches('[data-handle]')){e.preventDefault();connecting=document.activeElement.dataset.handle;assigning=null;fanPinned=null;drawGraph();}
  if(e.key==='Enter'&&document.activeElement?.matches('[data-edge]')){e.preventDefault();openModal('edge',p.edges.find(v=>v.id===document.activeElement.dataset.edge));}
});
document.addEventListener('keyup',e=>{if(e.code==='Space'){spaceHeld=false;$('#surface')?.classList.remove('space-pan');}});
function download(content,filename,type){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([content],{type}));a.href=url;a.download=filename.replace(/[\\/:*?"<>|]/g,'-');a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function selectedMarkdown(){const chosen=savedSelection.size?p.favorites.filter(f=>savedSelection.has(f.id)):null;return chosen?`# ${p.title}\n\n`+chosen.map(f=>toMarkdown(p,f)).join('\n\n---\n\n'):toMarkdown(p);}
async function copyText(value){try{await navigator.clipboard.writeText(value);toast('已复制');}catch{toast('浏览器未允许复制，请使用导出文件。','error');}}
async function copyShare(){const bytes=new TextEncoder().encode(JSON.stringify(p));if(bytes.length>450000)return toast('项目内容较多，请通过项目文件分享。','error');let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);await copyText(location.origin+'/#project='+btoa(binary));}
$('#file-import').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>5e6)throw new Error('项目文件过大，请选择小于 5MB 的文件');const project=validateProject(JSON.parse(await file.text()));project.id=uid();project.title+=' · 导入';projects.unshift(project);openProject(project);persist();toast('项目已打开，可以继续探索。');}catch(error){toast(error.message,'error');}e.target.value='';});
function wrapText(ctx,value,width,maxLines=3){const lines=[];let line='';for(const char of String(value)){if(ctx.measureText(line+char).width>width){lines.push(line);line=char;if(lines.length>=maxLines){lines[lines.length-1]=lines.at(-1).slice(0,-1)+'…';return lines;}}else line+=char;}if(line)lines.push(line);return lines;}
async function exportPng(){
  const nodes=visibleNodes(p,{focusId,showHidden}),b=boundsOf(nodes),pad=60,s=Math.min(2,6000/(b.width+pad*2)),canvas=document.createElement('canvas');canvas.width=(b.width+pad*2)*s;canvas.height=(b.height+pad*2+90)*s;const ctx=canvas.getContext('2d');ctx.scale(s,s);ctx.fillStyle='#F5F5F7';ctx.fillRect(0,0,canvas.width/s,canvas.height/s);ctx.fillStyle='#1D1D1F';ctx.font='600 24px -apple-system, BlinkMacSystemFont, sans-serif';ctx.fillText(p.title,pad,43);ctx.translate(pad-b.x,pad+65-b.y);const ids=new Set(nodes.map(n=>n.id));
  for(const e of p.edges.filter(e=>ids.has(e.from)&&ids.has(e.to))){const a=p.nodes.find(n=>n.id===e.from),bn=p.nodes.find(n=>n.id===e.to);ctx.strokeStyle=e.merged?'#8b7fc7':'#b5bdca';ctx.lineWidth=1.5;ctx.stroke(new Path2D(curve(a,bn).d));}
  const colors={root:'#007AFF',scene:'#8A6BD0',pain:'#D47D42',people:'#328A82'};
  for(const n of nodes){ctx.fillStyle='#FFFFFF';ctx.strokeStyle='#E1E3E8';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(n.x,n.y,CARD.width,CARD.height,18);ctx.fill();ctx.stroke();ctx.fillStyle=colors[n.kind];ctx.font='500 12px -apple-system,sans-serif';ctx.fillText(KINDS[n.kind].label,n.x+18,n.y+26);ctx.fillStyle='#1D1D1F';ctx.font='600 16px -apple-system,sans-serif';wrapText(ctx,n.title,CARD.width-36,2).forEach((line,i)=>ctx.fillText(line,n.x+18,n.y+55+i*23));ctx.fillStyle='#6E6E73';ctx.font='12px -apple-system,sans-serif';wrapText(ctx,n.description,CARD.width-36,2).forEach((line,i)=>ctx.fillText(line,n.x+18,n.y+105+i*18));}
  canvas.toBlob(blob=>{if(!blob)return toast('图片导出失败，请重试。','error');download(blob,p.title+'.png','image/png');toast('画布图片已导出。');},'image/png');
}
function printProject(){const old=$('#print-content');old?.remove();const print=document.createElement('section');print.id='print-content';print.innerHTML=`<h1>${esc(p.title)}</h1><p>${esc(p.description)}</p>${(p.favorites.length?p.favorites.map(f=>`<article><h2>${esc(f.title)}</h2><p>${esc(f.description)}</p><p>${esc(f.rationale)}</p>${pathMarkup(f.snapshot)}</article>`):p.nodes.map(n=>`<article><h2>${esc(n.title)}</h2><p>${esc(n.description)}</p><p>${esc(n.rationale)}</p></article>`)).join('')}`;document.body.appendChild(print);window.print();}
window.addEventListener('resize',()=>{if(screen==='workspace')drawNodePanel();});
render();refreshModel();
if(location.hash.startsWith('#project=')){try{const binary=atob(location.hash.slice(9));const value=JSON.parse(new TextDecoder().decode(Uint8Array.from(binary,c=>c.charCodeAt(0)))),project=validateProject(value);project.id=uid();project.title+=' · 副本';projects.unshift(project);openProject(project);persist();window.history.replaceState(null,'',location.pathname);}catch{toast('分享链接无法打开，可以让对方导出项目文件。','error');}}
if(new URLSearchParams(location.search).has('demo'))openDemo();
