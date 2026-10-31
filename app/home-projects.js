const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const folderPath='M0 4C0 1.79 1.79 0 4 0H16.524C17.721 0 18.842.54 19.574 1.467L22.426 5.065C23.159 5.992 24.279 6.533 25.476 6.533H46C48.209 6.533 50 8.324 50 10.533V36C50 38.209 48.209 40 46 40H4C1.79 40 0 38.209 0 36V4Z';
const fileGlyph='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></svg>';
const closeGlyph='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
const arrowGlyph='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>';

// Keep the folder decorative and the project actions as separate native buttons.
export function mountProjectHome(host,projects){
  let open=false,page=0,pageSize=capacity(),destroyed=false;
  const saved=[...projects].sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt));
  host.innerHTML=`<main class="home-launcher" aria-label="项目首页"><div class="home-content">
    <div class="launch-actions">
      <button type="button" class="launch-button launch-new" data-action="new-project"><span class="new-project-art" aria-hidden="true"><span>🌱</span><i>+</i></span><span>新建探索</span></button>
      <button type="button" class="launch-button launch-open" data-action="open-projects" aria-expanded="false" aria-controls="home-projects">
        <span class="project-folder" aria-hidden="true"><span class="folder-body">
          <svg class="folder-back" viewBox="0 0 50 40"><path d="${folderPath}"/></svg>
          <span class="folder-paper paper-third"></span><span class="folder-paper paper-second"></span><span class="folder-paper paper-first"></span>
          <span class="folder-front"><span class="folder-label"></span><span class="folder-count">${String(saved.length).padStart(2,'0')}</span></span>
        </span></span><span>打开项目</span>
      </button>
    </div>
    <section class="home-projects" id="home-projects" aria-label="已保存的项目" aria-hidden="true" inert>
      <header class="home-projects-header"><h1>项目 <span>${saved.length}</span></h1><div>
        <button type="button" class="home-project-tool" data-action="import" aria-label="从文件打开项目" title="从文件打开">${fileGlyph}</button>
        <button type="button" class="home-project-tool" data-action="close-projects" aria-label="收起项目" title="收起项目">${closeGlyph}</button>
      </div></header>
      <div class="home-project-fan"></div><nav class="home-project-pages" aria-label="项目分页"></nav>
    </section>
  </div></main>`;
  const home=host.querySelector('.home-launcher'),tray=host.querySelector('.home-projects'),fan=host.querySelector('.home-project-fan'),pages=host.querySelector('.home-project-pages'),toggle=host.querySelector('.launch-open');

  function capacity(){
    const columns=window.innerWidth>=780?3:window.innerWidth>=540?2:1;
    return columns*(window.innerHeight>=780?2:1);
  }
  function draw(){
    const count=Math.max(1,Math.ceil(saved.length/pageSize));page=Math.min(page,count-1);
    const items=saved.slice(page*pageSize,(page+1)*pageSize);
    home.style.setProperty('--project-tray-width',!items.length?'310px':items.length===1?'270px':items.length===2?'540px':'790px');
    home.style.setProperty('--home-open-offset',items.length>pageSize/(window.innerHeight>=780?2:1)?'244px':'138px');
    fan.innerHTML=items.length?items.map((project,index)=>`<article class="home-project-card" style="--project-tilt:${[-3,1.5,3,-1.5,2,-2][index]}deg;--project-delay:${index*45}ms;--project-tint:${['#edf3ff','#f1edf9','#edf6f1','#fbf2e8','#eff4f8','#f8eff3'][index]}">
      <button type="button" class="home-project-open" data-action="open-project" data-id="${escapeHTML(project.id)}" aria-label="打开项目：${escapeHTML(project.title)}">
        <span class="home-project-symbol" aria-hidden="true">${fileGlyph}</span>
        <h2>${escapeHTML(project.title)}</h2><p>${escapeHTML(project.description)}</p>
        <footer><span>${project.nodes.length} 张卡片</span><time datetime="${escapeHTML(project.updatedAt)}">${new Date(project.updatedAt).toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'})}</time></footer>
      </button>
      <button type="button" class="home-project-delete" data-action="delete-project" data-id="${escapeHTML(project.id)}" aria-label="删除项目：${escapeHTML(project.title)}" title="删除项目">${closeGlyph}</button>
    </article>`).join(''):'<div class="home-project-empty"><span aria-hidden="true">📭</span><p>暂无项目</p><button type="button" data-action="import">从文件打开</button></div>';
    pages.innerHTML=count>1?`<button type="button" class="home-project-tool page-previous" data-action="project-page-prev" aria-label="上一页项目" ${page===0?'disabled':''}>${arrowGlyph}</button><span aria-live="polite">${page+1} / ${count}</span><button type="button" class="home-project-tool" data-action="project-page-next" aria-label="下一页项目" ${page===count-1?'disabled':''}>${arrowGlyph}</button>`:'';
    pages.hidden=count===1;
  }
  function prepareOrigins(next){
    const actions=host.querySelector('.launch-actions'),folder=host.querySelector('.project-folder').getBoundingClientRect(),bounds=fan.getBoundingClientRect();
    const returnShift=next?0:-actions.offsetHeight/2-20-new DOMMatrix(getComputedStyle(actions).transform).m42;
    for(const card of fan.children){
      card.style.setProperty('--folder-x',`${folder.left+folder.width/2-bounds.left-card.offsetLeft-card.offsetWidth/2}px`);
      card.style.setProperty('--folder-y',`${folder.top+folder.height/2+returnShift-bounds.top-card.offsetTop-card.offsetHeight/2}px`);
    }
  }
  function setOpen(next,{restoreFocus=true}={}){
    if(destroyed||open===next)return;
    prepareOrigins(next);open=next;
    tray.inert=!open;tray.setAttribute('aria-hidden',String(!open));toggle.setAttribute('aria-expanded',String(open));
    home.classList.toggle('folder-open',open);
    if(!open&&restoreFocus)toggle.focus({preventScroll:true});
  }
  function turnPage(delta){
    if(!open)return;
    const next=Math.max(0,Math.min(Math.ceil(saved.length/pageSize)-1,page+delta));if(next===page)return;
    page=next;draw();
    if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
      [...fan.children].forEach((card,index)=>card.animate([{opacity:0,transform:'translateY(18px) rotate(0deg)'},{opacity:1,transform:`translateY(0) rotate(${card.style.getPropertyValue('--project-tilt')})`}],{duration:260,delay:index*35,easing:'cubic-bezier(.22,1,.36,1)',fill:'backwards'}));
    }
    // A disabled last-page button must not strand keyboard focus.
    const pageButton=pages.querySelector(`[data-action="project-page-${delta>0?'next':'prev'}"]:not([disabled])`)||pages.querySelector('button:not([disabled])');
    pageButton?.focus({preventScroll:true});
  }
  function resize(){
    const next=capacity();if(next===pageSize)return;
    const first=page*pageSize;pageSize=next;page=Math.floor(first/pageSize);draw();
  }
  function outside(event){if(open&&!event.target.closest('.launch-button,.home-projects'))setOpen(false);}
  home.addEventListener('click',outside);window.addEventListener('resize',resize);draw();
  return {
    get isOpen(){return open;},
    toggle(){setOpen(!open);},close(options){setOpen(false,options);},turnPage,
    destroy(){destroyed=true;window.removeEventListener('resize',resize);home.removeEventListener('click',outside);}
  };
}
