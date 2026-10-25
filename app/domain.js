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
// Reserve a loose ring of positions before requesting content, without moving existing work.
export function surroundingPositions(nodes, anchor, count, phase = nodes.length * 0.73) {
  const occupied = [...nodes], positions = [], gapX = CARD.width + 58, gapY = CARD.height + 66;
  for (let i = 0; i < count; i++) {
    const angle = phase + i * Math.PI * 2 / Math.max(count, 1);
    let position;
    for (let attempt = 0; attempt < 400; attempt++) {
      const ring = Math.floor(attempt / 16), turn = attempt % 16;
      const offset = turn ? Math.ceil(turn / 2) * 0.13 * (turn % 2 ? 1 : -1) : 0;
      const radius = Math.max(1.28, count / 5) + ring * 0.48;
      position = {x: Math.round(anchor.x + Math.cos(angle + offset) * gapX * radius), y: Math.round(anchor.y + Math.sin(angle + offset) * gapY * radius)};
      if (!occupied.some(n => Math.abs(n.x - position.x) < gapX && Math.abs(n.y - position.y) < gapY)) break;
    }
    positions.push(position); occupied.push(position);
  }
  return positions;
}
// A local, damped collision step. Spatial buckets keep distant cards out of the work.
export function repelCards(nodes, fixedId, {strength = 0.38, maxStep = 24, gap = 36, activeIds = new Set([fixedId])} = {}) {
  const width = CARD.width + gap, height = CARD.height + gap, buckets = new Map(), moved = new Set();
  const push = (node, dx, dy) => {
    node.x += dx; node.y += dy; moved.add(node.id); activeIds.add(node.id);
  };
  for (const node of nodes) {
    const gx = Math.floor(node.x / width), gy = Math.floor(node.y / height);
    for (let x = gx - 1; x <= gx + 1; x++) for (let y = gy - 1; y <= gy + 1; y++) {
      for (const other of buckets.get(`${x},${y}`) || []) {
        if (!activeIds.has(node.id) && !activeIds.has(other.id)) continue;
        const dx = node.x - other.x, dy = node.y - other.y, overlapX = width - Math.abs(dx), overlapY = height - Math.abs(dy);
        if (overlapX <= 0.12 || overlapY <= 0.12) continue;
        const horizontal = overlapX < overlapY, distance = Math.min(maxStep, (horizontal ? overlapX : overlapY) * strength);
        const sign = (horizontal ? dx : dy) < 0 ? -1 : 1;
        const nShare = node.id === fixedId ? 0 : other.id === fixedId ? 1 : 0.5;
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
export function appendGenerated(project, parentId, kind, candidates, origin = 'demo', reserved = null) {
  const parent = project.nodes.find(n => n.id === parentId);
  if (!parent || !KINDS[kind] || kind === 'root') throw new Error('请先选中一个有效节点');
  const positions = reserved || surroundingPositions(project.nodes, parent, candidates.length);
  const nodes = candidates.map((item, i) => {
    const preferred = positions[i] || surroundingPositions(project.nodes, parent, 1)[0];
    const pos = freePosition(project, preferred.x, preferred.y);
    const node = { id: uid(), kind, title: String(item.title).slice(0, 90), description: String(item.description || '').slice(0, 1600), rationale: String(item.rationale || '').slice(0, 1600), parentIds: [parent.id], ...pos, origin };
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
  if (!a || !b || a.id === b.id || a.kind !== b.kind || a.kind === 'root') throw new Error('请选择两张不同的同类卡片');
  const preferred = reserved || surroundingPositions(project.nodes, {x:(a.x+b.x)/2,y:(a.y+b.y)/2}, 1)[0];
  const pos = freePosition(project, preferred.x, preferred.y);
  const node = { id: uid(), kind: a.kind, title: String(candidate.title).slice(0, 90), description: String(candidate.description || '').slice(0, 1600), rationale: String(candidate.rationale || '').slice(0, 1600), parentIds: [a.id, b.id], ...pos, origin, merged: true };
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
