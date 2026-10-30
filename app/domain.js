import {inferSceneCategory,validSceneCategory} from './scene-categories.js';
export const VERSION = 1;
export const KINDS = {
  root: { label: '选题中心', short: '想法', icon: 'lightbulb' },
  scene: { label: '场景', short: '场景', icon: 'locate-fixed' },
  pain: { label: '痛点', short: '痛点', icon: 'sparkles' },
  people: { label: '人群', short: '人群', icon: 'git-branch' },
};
export const CARD = { width: 244, height: 154 };
export const uid = () => crypto.randomUUID();
export const clone = value => structuredClone(value);
export function createProject(description, title = '') {
  const id = uid();
  return {
    version: VERSION, id, title: title.trim() || description.trim().split(/[。！？\n]/)[0].slice(0, 22) || '未命名探索',
    description: description.trim(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    nodes: [{ id: uid(), kind: 'root', title: description.trim().slice(0, 42) || '一个还不确定的想法', description: description.trim(), rationale: '这次探索最初想弄清楚的事。', parentIds: [], x: 0, y: 0, origin: 'manual' }],
    edges: [], favorites: [], context: '', generationCount: 3,
  };
}
export const rootOf = p => p.nodes.find(n => n.kind === 'root');
export function getPaths(project, nodeId, limit = 512) {
  const index = new Map(project.nodes.map(n => [n.id, n]));
  const memo = new Map();
  function walk(id, seen) {
    if (seen.has(id)) throw new Error('探索路径存在循环');
    if (memo.has(id)) return memo.get(id);
    const node = index.get(id); if (!node) return [];
    const next = new Set(seen); next.add(id);
    if (!node.parentIds.length) return [[node]];
    const paths=[];
    for(const parent of node.parentIds){for(const path of walk(parent,next)){paths.push([...path,node]);if(paths.length>limit)throw new Error('这张卡片的关联路径超过 512 条，请先拆分探索项目');}}
    memo.set(id,paths);return paths;
  }
  return walk(nodeId, new Set());
}
export function ancestorsOf(project, nodeId) {
  return [...new Map(getPaths(project, nodeId).flat().map(n => [n.id, n])).values()];
}
export function descendantsOf(project, nodeId) {
  const ids = new Set([nodeId]); let changed = true;
  while (changed) { changed = false; for (const n of project.nodes) if (!ids.has(n.id) && n.parentIds.some(id => ids.has(id))) { ids.add(n.id); changed = true; } }
  return ids;
}
function freePosition(project, x, y) {
  let attempts = 0;
  while (project.nodes.some(n => Math.abs(n.x - x) < CARD.width + 30 && Math.abs(n.y - y) < CARD.height + 28) && attempts++ < 100) y += CARD.height + 38;
  return { x, y };
}
export const LAYOUT_GAP = {x: CARD.width + 132, y: CARD.height + 144};
const layoutGap = LAYOUT_GAP;
const collides = (a, b) => Math.abs(a.x-b.x) < layoutGap.x-0.01 && Math.abs(a.y-b.y) < layoutGap.y-0.01;
// Select nearby slots first; existing cards make room instead of sending new ideas away.
export function surroundingPositions(nodes, anchor, count, phase = nodes.length * 0.73, protectedIds = new Set([anchor.id])) {
  const fixed = nodes.filter(n => protectedIds.has(n.id)), slots = [], positions = [];
  for (let ring=1; slots.length<count+8; ring++) {
    for (let x=-ring; x<=ring; x++) for (let y=-ring; y<=ring; y++) {
      if (Math.max(Math.abs(x),Math.abs(y))!==ring) continue;
      const slot={x:anchor.x+x*layoutGap.x,y:anchor.y+y*layoutGap.y,gx:x,gy:y};
      slot.crowding=nodes.filter(n=>collides(n,slot)).length;
      if (!fixed.some(n=>collides(n,slot))) slots.push(slot);
    }
  }
  for (let i=0; i<count; i++) {
    const angle=phase+i*Math.PI*2/Math.max(count,1);
    const score=slot=>{
      const delta=Math.atan2(Math.sin(Math.atan2(slot.gy,slot.gx)-angle),Math.cos(Math.atan2(slot.gy,slot.gx)-angle));
      return Math.max(Math.abs(slot.gx),Math.abs(slot.gy))*4+Math.abs(delta)+slot.crowding*.025;
    };
    slots.sort((a,b)=>score(a)-score(b));
    const slot=slots.shift();
    positions.push({x:slot.x,y:slot.y});
  }
  return positions;
}
export function makeRoomForPositions(nodes, positions, protectedIds = new Set()) {
  const fixed=nodes.filter(n=>protectedIds.has(n.id));
  if (positions.some(pos=>fixed.some(n=>collides(n,pos)))) throw new Error('来源卡片的位置已变化，请重新生成');
  const displaced=nodes.filter(n=>!protectedIds.has(n.id)&&positions.some(pos=>collides(n,pos)));
  const displacedIds=new Set(displaced.map(n=>n.id));
  const blockers=[...positions,...nodes.filter(n=>!displacedIds.has(n.id))], moves=new Map();
  for (const node of displaced) {
    const queue=[{x:node.x,y:node.y}],seen=new Set();let position;
    for (let attempt=0;queue.length&&attempt<2000;attempt++) {
      queue.sort((a,b)=>(a.x-node.x)**2+(a.y-node.y)**2-((b.x-node.x)**2+(b.y-node.y)**2));
      const candidate=queue.shift(),key=`${candidate.x},${candidate.y}`;
      if(seen.has(key))continue;seen.add(key);
      const hit=blockers.find(n=>collides(n,candidate));
      if(!hit){position=candidate;break;}
      queue.push({x:hit.x-layoutGap.x,y:candidate.y},{x:hit.x+layoutGap.x,y:candidate.y},{x:candidate.x,y:hit.y-layoutGap.y},{x:candidate.x,y:hit.y+layoutGap.y});
    }
    // A finite canvas can always be cleared past its rightmost occupied card.
    position ||= {x:Math.max(...blockers.map(n=>n.x))+layoutGap.x,y:node.y};
    moves.set(node.id,position);blockers.push(position);
  }
  const preview=nodes.map(n=>({...n,...moves.get(n.id)}));
  const reserved=positions.map((position,i)=>({id:`reserved:${i}`,...position}));
  spreadCrowdedCards([...preview,...reserved],new Set([...protectedIds,...reserved.map(n=>n.id)]));
  for(let i=0;i<nodes.length;i++)if(Math.abs(preview[i].x-nodes[i].x)>.01||Math.abs(preview[i].y-nodes[i].y)>.01)moves.set(nodes[i].id,{x:preview[i].x,y:preview[i].y});
  return moves;
}
export function planNearbySpace(nodes, anchor, count, protectedIds = new Set([anchor.id])) {
  const positions=surroundingPositions(nodes,anchor,count,nodes.length*.73,protectedIds);
  return {positions,moves:makeRoomForPositions(nodes,positions,protectedIds)};
}
// Reserve the complete batch before requesting the model. Dense sources escape
// with their branch; the preview is pure so cancelling restores the exact canvas.
export function planGenerationSpace(project,parentId,count) {
  const parent=project.nodes.find(node=>node.id===parentId);
  if(!parent)throw new Error('来源卡片已不存在');
  const upstream=new Set(ancestorsOf(project,parentId).map(node=>node.id));
  const branch=descendantsOf(project,parentId),others=project.nodes.filter(node=>!branch.has(node.id));
  const density=point=>others.reduce((total,node)=>total+Math.exp(-(((point.x-node.x)/layoutGap.x)**2+((point.y-node.y)/layoutGap.y)**2)/2),0);
  let anchor={...parent};
  const localDensity=project.nodes.filter(node=>node.id!==parentId&&Math.hypot((node.x-parent.x)/layoutGap.x,(node.y-parent.y)/layoutGap.y)<2.2).length;
  if(parent.kind!=='root'&&localDensity>=4) {
    const local=others.filter(node=>Math.hypot((node.x-parent.x)/layoutGap.x,(node.y-parent.y)/layoutGap.y)<3);
    const centre=local.reduce((sum,node)=>({x:sum.x+node.x/local.length,y:sum.y+node.y/local.length}),{x:0,y:0});
    const away=Math.atan2(parent.y-centre.y,parent.x-centre.x);
    let best=localDensity*4;
    for(let ring=1;ring<=3;ring++)for(let i=0;i<12;i++) {
      const angle=away+i*Math.PI/6,point={x:parent.x+Math.cos(angle)*ring*layoutGap.x,y:parent.y+Math.sin(angle)*ring*layoutGap.y};
      if(others.some(node=>collides(node,point)))continue;
      const score=density(point)*4+ring*.65;
      if(score<best){best=score;anchor={...parent,...point};}
    }
  }
  const dx=anchor.x-parent.x,dy=anchor.y-parent.y,moves=new Map();
  const preview=project.nodes.map(node=>{
    if(branch.has(node.id)&&(dx||dy)){const position={x:node.x+dx,y:node.y+dy};moves.set(node.id,position);return {...node,...position};}
    return {...node};
  });
  const protectedIds=new Set(upstream);
  const plan=planNearbySpace(preview,anchor,count,protectedIds);
  for(const [id,position] of plan.moves)moves.set(id,position);
  // Physics smooths the movement, while this final packing pass guarantees that
  // a tightly stacked old cluster cannot overlap the reserved batch at rest.
  const settled=project.nodes.map(node=>({...node,...moves.get(node.id)}));
  const placed=[...plan.positions,...settled.filter(node=>protectedIds.has(node.id))];
  for(const node of settled.filter(node=>!protectedIds.has(node.id))) {
    if(placed.some(other=>collides(other,node))) {
      let position;
      for(let ring=1;!position;ring++) {
        const slots=[];
        for(let x=-ring;x<=ring;x++)for(let y=-ring;y<=ring;y++)if(Math.max(Math.abs(x),Math.abs(y))===ring)slots.push({x:node.x+x*layoutGap.x,y:node.y+y*layoutGap.y});
        slots.sort((a,b)=>(a.x-node.x)**2+(a.y-node.y)**2-((b.x-node.x)**2+(b.y-node.y)**2));
        position=slots.find(slot=>!placed.some(other=>collides(other,slot)));
      }
      Object.assign(node,position);moves.set(node.id,position);
    }
    placed.push(node);
  }
  return {positions:plan.positions,moves,anchor};
}
export function branchPositions(project, nodeId) {
  const ids=new Set((Array.isArray(nodeId)?nodeId:[nodeId]).flatMap(id=>[...descendantsOf(project,id)]));
  return new Map(project.nodes.filter(n=>ids.has(n.id)).map(n=>[n.id,{x:n.x,y:n.y}]));
}
export function moveBranch(project, origins, dx, dy) {
  const moved=[];
  for(const node of project.nodes){const origin=origins.get(node.id);if(origin){node.x=origin.x+dx;node.y=origin.y+dy;moved.push(node);}}
  return moved;
}
export const canCombine = (a,b) => !!a&&!!b&&a.id!==b.id&&a.kind!=='root'&&a.kind===b.kind;

// Each mainline gets its own vertical band; a shared idea is placed once, with both edges kept.
export function arrangeByMainline(project) {
  const root=rootOf(project),index=new Map(project.nodes.map(n=>[n.id,n])),children=new Map(),heights=new Map(),depths=new Map();
  for(const node of project.nodes){const owner=node.parentIds[0];if(owner){if(!children.has(owner))children.set(owner,[]);children.get(owner).push(node);}}
  const height=node=>{if(!heights.has(node.id))heights.set(node.id,Math.max(LAYOUT_GAP.y,(children.get(node.id)||[]).reduce((sum,n)=>sum+height(n),0)));return heights.get(node.id);};
  const depth=node=>{if(!depths.has(node.id))depths.set(node.id,node.parentIds.length?1+Math.max(...node.parentIds.map(id=>depth(index.get(id)))):0);return depths.get(node.id);};
  const column=LAYOUT_GAP.x+28;
  const place=(node,side,top,baseDepth=0,baseX=root.x)=>{
    node.x=baseX+side*(depth(node)-baseDepth)*column;
    node.y=top+(height(node)-CARD.height)/2;
    let cursor=top;for(const child of children.get(node.id)||[]){place(child,side,cursor,baseDepth,baseX);cursor+=height(child);}
  };
  const sides=[{sign:-1,total:0,nodes:[]},{sign:1,total:0,nodes:[]}];
  for(const node of children.get(root.id)||[]){const side=sides[0].total<=sides[1].total?sides[0]:sides[1];side.nodes.push(node);side.total+=height(node);}
  for(const side of sides){let cursor=root.y+CARD.height/2-side.total/2;for(const node of side.nodes){place(node,side.sign,cursor);cursor+=height(node);}}
  let bottom=root.y+CARD.height/2+Math.max(...sides.map(s=>s.total))/2+160;
  for(const node of project.nodes.filter(n=>n.id!==root.id&&!n.parentIds.length)){place(node,1,bottom,depth(node));bottom+=height(node)+80;}
  return project.nodes;
}
// A local, damped collision step. Spatial buckets keep distant cards out of the work.
export function repelCards(nodes, fixedId, {strength = 0.38, maxStep = 24, gap = 36, activeIds = new Set([fixedId]), fixedIds = new Set([fixedId])} = {}) {
  const width = CARD.width + gap, height = CARD.height + gap, buckets = new Map(), moved = new Set();
  const push = (node, dx, dy) => {
    node.x += dx; node.y += dy; moved.add(node.id); activeIds.add(node.id);
  };
  for (const node of nodes) {
    const gx = Math.floor(node.x / width), gy = Math.floor(node.y / height);
    for (let x = gx - 1; x <= gx + 1; x++) for (let y = gy - 1; y <= gy + 1; y++) {
      for (const other of buckets.get(`${x},${y}`) || []) {
        if (!activeIds.has(node.id) && !activeIds.has(other.id)) continue;
        if (fixedIds.has(node.id) && fixedIds.has(other.id)) continue;
        const dx = node.x - other.x, dy = node.y - other.y, overlapX = width - Math.abs(dx), overlapY = height - Math.abs(dy);
        if (overlapX <= 0.12 || overlapY <= 0.12) continue;
        const horizontal = overlapX < overlapY, distance = Math.min(maxStep, (horizontal ? overlapX : overlapY) * strength);
        const sign = (horizontal ? dx : dy) < 0 ? -1 : 1;
        const nShare = fixedIds.has(node.id) ? 0 : fixedIds.has(other.id) ? 1 : 0.5;
        const oShare = 1 - nShare;
        if (nShare) push(node, horizontal ? sign * distance * nShare : 0, horizontal ? 0 : sign * distance * nShare);
        if (oShare) push(other, horizontal ? -sign * distance * oShare : 0, horizontal ? 0 : -sign * distance * oShare);
      }
    }
    const key = `${Math.floor(node.x / width)},${Math.floor(node.y / height)}`;
    if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(node);
  }
  return moved;
}
export function spreadCrowdedCards(nodes, fixedIds = new Set()) {
  const activeIds=new Set(nodes.map(n=>n.id)),moved=new Set();
  for(let frame=0;frame<220;frame++){
    const step=repelCards(nodes,null,{gap:112,fixedIds,activeIds,strength:.5,maxStep:40});
    for(const id of step)moved.add(id);
    if(!step.size)break;
  }
  return moved;
}
export function nodesInRect(nodes, rect) {
  return nodes.filter(n=>n.x<rect.x+rect.width&&n.x+CARD.width>rect.x&&n.y<rect.y+rect.height&&n.y+CARD.height>rect.y).map(n=>n.id);
}
export function selectionExport(project, ids) {
  const selected=new Set(ids),nodes=clone(project.nodes.filter(n=>selected.has(n.id)));
  if(!nodes.length)throw new Error('请先框选要导出的卡片');
  for(const n of nodes){n.parentIds=n.parentIds.filter(id=>selected.has(id));n.merged=n.parentIds.length>1;}
  return {format:'topic-explorer-selection',version:VERSION,title:project.title+' · 选区',description:`选中的 ${nodes.length} 张卡片`,context:'',nodes,edges:clone(project.edges.filter(e=>selected.has(e.from)&&selected.has(e.to))),favorites:[]};
}
export function importSelection(value) {
  if(value?.format!=='topic-explorer-selection'||value.version!==VERSION||!Array.isArray(value.nodes)||!value.nodes.length||!Array.isArray(value.edges)||typeof value.title!=='string')throw new Error('这不是有效的选区文件');
  const project=createProject(value.description||'从选区继续探索',value.title),nodes=clone(value.nodes),edges=clone(value.edges);
  const originalRoot=nodes.find(n=>n.kind==='root'),root=originalRoot||rootOf(project);
  // Validate the original selection before attaching its independent entries to a new centre.
  project.nodes=originalRoot?nodes:[root,...nodes];project.edges=edges;
  validateProject(project);
  if(!originalRoot)for(const n of nodes)if(!n.parentIds.length){n.parentIds=[root.id];project.edges.push({id:uid(),from:root.id,to:n.id,relation:'选区入口',rationale:n.rationale||'从导入的选区继续探索。'});}
  return validateProject(project);
}
export function appendGenerated(project, parentId, kind, candidates, origin = 'demo', reserved = null) {
  const parent = project.nodes.find(n => n.id === parentId);
  if (!parent || !KINDS[kind] || kind === 'root') throw new Error('请先选中一个有效节点');
  const protectedIds=new Set(ancestorsOf(project,parentId).map(n=>n.id));
  const positions = reserved?.positions || reserved || planNearbySpace(project.nodes, parent, candidates.length,protectedIds).positions;
  const moves=reserved?.moves || makeRoomForPositions(project.nodes,positions,protectedIds);
  for(const node of project.nodes)if(moves.has(node.id))Object.assign(node,moves.get(node.id));
  const nodes = candidates.map((item, i) => {
    const pos = positions[i];
    const node = { id: uid(), kind, title: String(item.title).slice(0, 90), description: String(item.description || '').slice(0, 1600), rationale: String(item.rationale || '').slice(0, 1600), parentIds: [parent.id], ...pos, origin };
    if(kind==='scene')node.sceneCategory=inferSceneCategory({...node,sceneCategory:item.sceneCategory});
    project.nodes.push(node); project.edges.push({ id: uid(), from: parent.id, to: node.id, relation: parent.kind === kind ? '继续细化' : `探索${KINDS[kind].label}`, rationale: node.rationale });
    return node;
  });
  project.updatedAt = new Date().toISOString(); return nodes;
}
export function appendManual(project, parentId, kind, title, description = '', position = null) {
  if (!title.trim()) throw new Error('先写下一点想法');
  if (!parentId) {
    const pos = freePosition(project, position?.x ?? 40, position?.y ?? 300);
    const node = { id: uid(), kind, title: title.trim().slice(0,90), description:description||(title.trim().length>90?title.trim():''), rationale: '这是你独立补充的想法，尚未指定上层。', parentIds: [], ...pos, origin:'manual' };
    project.nodes.push(node); project.updatedAt = new Date().toISOString(); return node;
  }
  return appendGenerated(project, parentId || rootOf(project).id, kind, [{ title: title.trim(), description, rationale: '由你补充到当前想法下，可继续编辑关联理由。' }], 'manual')[0];
}
export function assignParent(project, nodeId, parentId) {
  const node=project.nodes.find(n=>n.id===nodeId),parent=project.nodes.find(n=>n.id===parentId);
  if(!node||!parent||node.kind==='root'||descendantsOf(project,nodeId).has(parentId))throw new Error('这个归属会形成循环，请选择其他上层节点');
  project.edges=project.edges.filter(e=>e.to!==node.id);node.parentIds=[parent.id];node.merged=false;
  node.rationale=`你将“${node.title}”归到“${parent.title}”下，可编辑这一步的关联理由。`;
  project.edges.push({id:uid(),from:parent.id,to:node.id,relation:'手动关联',rationale:node.rationale});
}
export function mergeNodes(project, aId, bId, candidate, origin = 'demo', reserved = null) {
  const a = project.nodes.find(n => n.id === aId), b = project.nodes.find(n => n.id === bId);
  if (!canCombine(a,b)) throw new Error('请选择两张不同的同类卡片');
  const protectedIds=new Set([...ancestorsOf(project,aId),...ancestorsOf(project,bId)].map(n=>n.id));
  const pos = reserved || planNearbySpace(project.nodes,{x:(a.x+b.x)/2,y:(a.y+b.y)/2},1,protectedIds).positions[0];
  const moves=makeRoomForPositions(project.nodes,[pos],protectedIds);
  for(const node of project.nodes)if(moves.has(node.id))Object.assign(node,moves.get(node.id));
  const node = { id: uid(), kind: a.kind, title: String(candidate.title).slice(0, 90), description: String(candidate.description || '').slice(0, 1600), rationale: String(candidate.rationale || '').slice(0, 1600), parentIds: [a.id, b.id], ...pos, origin, merged: true };
  if(node.kind==='scene')node.sceneCategory=inferSceneCategory({...node,sceneCategory:candidate.sceneCategory});
  project.nodes.push(node);
  for (const p of [a, b]) project.edges.push({ id: uid(), from: p.id, to: node.id, relation: '共同点 / 交集', rationale: node.rationale, merged: true });
  project.updatedAt = new Date().toISOString(); return node;
}
export function favoriteNode(project, nodeId) {
  const old = project.favorites.find(f => f.nodeId === nodeId);
  if (old) { project.favorites = project.favorites.filter(f => f.id !== old.id); return null; }
  const node = project.nodes.find(n => n.id === nodeId); if (!node || node.kind === 'root') throw new Error('请选择一张想保留的方向卡片');
  const paths = getPaths(project, nodeId), ids = new Set(paths.flat().map(n => n.id));
  const saved = { id: uid(), nodeId, title: node.title, description: node.description, rationale: node.rationale, kind: node.kind, createdAt: new Date().toISOString(), snapshot: { nodes: clone(project.nodes.filter(n => ids.has(n.id))), edges: clone(project.edges.filter(e => ids.has(e.from) && ids.has(e.to))), paths: paths.map(path => path.map(n => n.id)), projectTitle: project.title, projectDescription: project.description } };
  project.favorites.push(saved); return saved;
}
export function removeBranch(project, nodeId) {
  if (rootOf(project).id === nodeId) throw new Error('选题中心需要保留');
  const remove = new Set([nodeId]); let changed = true;
  while (changed) { changed = false; for (const n of project.nodes) if (n.parentIds.length && n.parentIds.every(id => remove.has(id)) && !remove.has(n.id)) { remove.add(n.id); changed = true; } }
  project.nodes = project.nodes.filter(n => !remove.has(n.id)).map(n => ({ ...n, parentIds: n.parentIds.filter(id => !remove.has(id)) }));
  project.edges = project.edges.filter(e => !remove.has(e.from) && !remove.has(e.to));
  return remove;
}
export function visibleNodes(project, { focusId = null, showHidden = false } = {}) {
  const visible = new Set(); const all = project.nodes;
  for (let i = 0; i <= all.length; i++) for (const n of all) if ((showHidden || !n.hidden) && (!n.parentIds.length || n.parentIds.some(id => visible.has(id)))) visible.add(n.id);
  let focus;
  if (focusId) focus = new Set([...ancestorsOf(project, focusId).map(n => n.id), ...descendantsOf(project, focusId)]);
  return all.filter(n => visible.has(n.id) && (!focus || focus.has(n.id)));
}
export function boundsOf(nodes) {
  if (!nodes.length) return { x: 0, y: 0, width: CARD.width, height: CARD.height };
  const x = Math.min(...nodes.map(n => n.x)), y = Math.min(...nodes.map(n => n.y));
  return { x, y, width: Math.max(...nodes.map(n => n.x + CARD.width)) - x, height: Math.max(...nodes.map(n => n.y + CARD.height)) - y };
}
export function validateProject(value) {
  if (!value || value.version !== VERSION || !Array.isArray(value.nodes) || !value.nodes.length || value.nodes.length > 600 || !Array.isArray(value.edges)) throw new Error('这不是有效的探索项目文件');
  if (value.nodes.filter(n => n.kind === 'root').length !== 1) throw new Error('项目需要一个选题中心');
  const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(id);
  if(!validId(value.id)||typeof value.title!=='string'||typeof value.description!=='string'||!Array.isArray(value.favorites))throw new Error('项目基本信息格式不正确');
  const checkGraph=graph=>{
    const ids=new Set();
    for(const n of graph.nodes){
      if(!validId(n.id)||ids.has(n.id)||!Object.hasOwn(KINDS,n.kind)||typeof n.title!=='string'||n.title.length>200||!Array.isArray(n.parentIds)||n.parentIds.length>2||!Number.isFinite(n.x)||!Number.isFinite(n.y))throw new Error('项目卡片格式不正确');
      if(n.kind==='root'&&n.parentIds.length)throw new Error('选题中心不能有上层节点');
      if(n.sceneCategory!==undefined&&!validSceneCategory(n.sceneCategory))throw new Error('场景分类格式不正确');
      ids.add(n.id);
    }
    for(const n of graph.nodes){if(n.parentIds.some(id=>!ids.has(id))||new Set(n.parentIds).size!==n.parentIds.length)throw new Error('项目中有找不到来源的卡片');getPaths(graph,n.id);}
    for(const e of graph.edges)if(!validId(e.id)||!ids.has(e.from)||!ids.has(e.to)||!graph.nodes.find(n=>n.id===e.to).parentIds.includes(e.from))throw new Error('项目中有失效连线');
    for(const n of graph.nodes)for(const parent of n.parentIds)if(!graph.edges.some(e=>e.from===parent&&e.to===n.id))throw new Error('项目中缺少关联连线');
  };
  checkGraph(value);
  for(const f of value.favorites){
    if(!validId(f.id)||!validId(f.nodeId)||!Object.hasOwn(KINDS,f.kind)||!f.snapshot||!Array.isArray(f.snapshot.nodes)||!Array.isArray(f.snapshot.edges)||!Array.isArray(f.snapshot.paths)||f.snapshot.nodes.length>600)throw new Error('收藏快照格式不正确');
    checkGraph(f.snapshot);
    const expected=getPaths(f.snapshot,f.nodeId).map(path=>path.map(n=>n.id));
    if(!expected.length||JSON.stringify(expected)!==JSON.stringify(f.snapshot.paths))throw new Error('收藏路径不完整');
  }
  const project = clone(value); project.favorites ||= []; project.context ||= ''; project.generationCount = [3, 6, 10].includes(value.generationCount) ? value.generationCount : 3; return project;
}
export function toMarkdown(project, saved = null) {
  const nodes = saved?.snapshot.nodes || project.nodes;
  const selected = saved ? [saved] : project.favorites;
  let out = `# ${saved?.title || project.title}\n\n${project.description}\n\n`;
  if (project.context) out += `## 项目条件\n\n${project.context}\n\n`;
  if (selected.length) for (const item of selected) {
    out += `## ${item.title}\n\n${item.description || ''}\n\n**细化理由**：${item.rationale || '尚未补充'}\n\n`;
    for (const path of item.snapshot.paths) out += `- 探索路径：${path.map(id => item.snapshot.nodes.find(n => n.id === id)?.title || '').join(' → ')}\n`;
    out += '\n';
  }
  out += '## 探索节点\n\n';
  for (const n of nodes) out += `### ${KINDS[n.kind].label}：${n.title}\n\n${n.description || ''}\n\n${n.parentIds.length?`上层想法：${n.parentIds.map(id=>nodes.find(v=>v.id===id)?.title||'').join(' / ')}\n\n`:''}关联理由：${n.rationale || '尚未补充'}\n\n`;
  return out + '\n---\n以上候选方向仍需通过资料或调研验证。\n';
}
