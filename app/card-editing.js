import {ancestorsOf} from './domain.js';
import {validSceneCategory,inferSceneCategory} from './scene-categories.js';
import {normalizeInspiration} from './inspiration.js';

export function selectionRelations(project,id) {
  return {
    upstream:new Set(id?ancestorsOf(project,id).map(node=>node.id):[]),
    children:new Set(id?project.nodes.filter(node=>node.parentIds.includes(id)).map(node=>node.id):[]),
  };
}
export function editCard(project,id,draft) {
  const node=project.nodes.find(value=>value.id===id);
  if(!node)throw new Error('这张卡片已不存在');
  const title=String(draft.title||'').trim();
  if(!title)throw new Error('请写下卡片内容');
  const inspiration=node.kind==='inspiration'?normalizeInspiration({element:draft.inspirationElement??node.inspiration.element,mechanism:draft.inspirationMechanism??node.inspiration.mechanism,span:draft.inspirationSpan??node.inspiration.span},true):null;
  if(node.kind==='root') {
    node.title=title.slice(0,42);node.description=title.slice(0,2000);
    project.description=node.description;
  } else {
    node.title=title.slice(0,90);node.description=String(draft.description||'').trim().slice(0,1600);
  }
  node.rationale=String(draft.rationale??node.rationale??'').trim().slice(0,1600);
  if(inspiration)node.inspiration=inspiration;
  if(node.kind==='scene')node.sceneCategory=validSceneCategory(draft.sceneCategory)?draft.sceneCategory:inferSceneCategory({...node,sceneCategory:null});
  for(const edge of project.edges)if(edge.to===id)edge.rationale=node.rationale;
  return node;
}
