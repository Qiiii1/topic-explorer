export const SCENE_CATEGORIES = {
  community: {label:'社区',color:'#278477',pattern:/社区|邻里|街坊|小区|街区|居民活动/},
  commute: {label:'通勤',color:'#4a73bc',pattern:/通勤|地铁|公交|换乘|候车|车站|出行|交通/},
  learning: {label:'学习',color:'#9564b9',pattern:/学习|课堂|学校|校园|图书馆|自习|教学|课程/},
  work: {label:'工作',color:'#b37a32',pattern:/工作|办公|会议|职场|工位|同事|团队协作/},
  home: {label:'居家',color:'#b4698a',pattern:/居家|家中|家庭|卧室|客厅|厨房|独居|租房/},
  public: {label:'公共空间',color:'#43879b',pattern:/公共空间|公园|广场|街道|步行|商场|咖啡馆/},
  online: {label:'线上',color:'#6976b9',pattern:/线上|社交平台|远程|网络|网页|软件|插件|数字空间/},
  other: {label:'其他场景',color:'#7c879b'},
};
export const validSceneCategory = value => typeof value==='string' && Object.hasOwn(SCENE_CATEGORIES,value);
export function inferSceneCategory(node) {
  if(validSceneCategory(node.sceneCategory))return node.sceneCategory;
  const text=`${node.title||''} ${node.description||''}`;
  return Object.entries(SCENE_CATEGORIES).find(([,value])=>value.pattern?.test(text))?.[0]||'other';
}
// A new scene starts a category; other dimensions follow their nearest scene(s).
// Shared intersections retain both origins instead of borrowing one parent's colour.
export function sceneRelations(project) {
  const index=new Map(project.nodes.map(node=>[node.id,node])),memo=new Map();
  function visit(id,seen=new Set()) {
    if(memo.has(id))return memo.get(id);
    if(seen.has(id))return ['other'];
    const node=index.get(id);if(!node)return ['other'];
    const next=new Set(seen);next.add(id);
    let categories=node.kind==='scene'?[inferSceneCategory(node)]:[];
    if(!categories.length)categories=[...new Set(node.parentIds.flatMap(parent=>visit(parent,next)))];
    if(!categories.length)categories=['other'];
    memo.set(id,categories);return categories;
  }
  for(const node of project.nodes)visit(node.id);
  return memo;
}
export function edgeSceneCategories(project,edge,relations=sceneRelations(project)) {
  const target=project.nodes.find(node=>node.id===edge.to);
  return target?.kind==='scene'?relations.get(edge.to):relations.get(edge.from)||['other'];
}
