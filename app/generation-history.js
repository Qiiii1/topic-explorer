import {clone,descendantsOf} from './domain.js';

// Keep patches for generation and deletion in one chronological stack.
// Restoring a patch never rewinds unrelated moves, edits, favorites or context.
function capture(project,ids){
  const removed=new Set(ids),nodes=clone(project.nodes.filter(node=>node.kind!=='root'&&removed.has(node.id)));
  const actual=new Set(nodes.map(node=>node.id));
  return {nodes,edges:clone(project.edges.filter(edge=>actual.has(edge.from)||actual.has(edge.to))),detached:project.nodes.filter(node=>!actual.has(node.id)&&node.parentIds.some(id=>actual.has(id))).map(node=>({id:node.id,beforeParents:[...node.parentIds],afterParents:node.parentIds.filter(id=>!actual.has(id)),merged:!!node.merged}))};
}
function detach(project,ids){
  const patch=capture(project,ids),removed=new Set(patch.nodes.map(node=>node.id));
  project.nodes=project.nodes.filter(node=>!removed.has(node.id));
  for(const node of project.nodes){if(!node.parentIds.some(id=>removed.has(id)))continue;node.parentIds=node.parentIds.filter(id=>!removed.has(id));if(node.parentIds.length<2)node.merged=false;}
  project.edges=project.edges.filter(edge=>!removed.has(edge.from)&&!removed.has(edge.to));
  return patch;
}
function restore(project,patch){
  const present=new Set(project.nodes.map(node=>node.id)),nodes=clone(patch.nodes.filter(node=>!present.has(node.id))),restored=new Set(nodes.map(node=>node.id));
  const attachable=new Set(patch.detached.filter(saved=>{
    const node=project.nodes.find(node=>node.id===saved.id);
    return node&&JSON.stringify(node.parentIds)===JSON.stringify(saved.afterParents);
  }).map(saved=>saved.id));
  for(const node of nodes){node.parentIds=[];node.merged=false;project.nodes.push(node);present.add(node.id);}
  for(const edge of clone(patch.edges)){
    if(!present.has(edge.from)||!present.has(edge.to)||(!restored.has(edge.to)&&!attachable.has(edge.to)))continue;
    if(project.edges.some(other=>other.id===edge.id)||descendantsOf(project,edge.to).has(edge.from))continue;
    const node=project.nodes.find(node=>node.id===edge.to);
    if(!node.parentIds.includes(edge.from))node.parentIds.push(edge.from);
    project.edges.push(edge);
  }
  for(const node of nodes)node.merged=!!patch.nodes.find(saved=>saved.id===node.id)?.merged&&node.parentIds.length>1;
  for(const saved of patch.detached){
    const node=project.nodes.find(node=>node.id===saved.id);
    if(node&&attachable.has(node.id)){node.parentIds=saved.beforeParents.filter(id=>node.parentIds.includes(id));node.merged=saved.merged&&node.parentIds.length>1;}
  }
  return nodes;
}
export class GenerationHistory{
  constructor(){this.clear();}
  clear(){this.past=[];this.future=[];this.lastEffect=null;}
  push(entry){this.past.push(entry);if(this.past.length>60)this.past.shift();this.future=[];}
  record(nodes){if(nodes.length)this.push({type:'generate',ids:nodes.map(node=>node.id)});}
  recordDeletion(before,ids){const patch=capture(before,ids);if(patch.nodes.length)this.push({type:'delete',patch});}
  canUndo(project){return this.past.some(entry=>entry.type==='delete'?entry.patch.nodes.some(node=>!project.nodes.some(other=>other.id===node.id)):project.nodes.some(node=>entry.ids.includes(node.id)));}
  canRedo(){return this.future.length>0;}
  undo(project){
    let entry;
    while((entry=this.past.pop())){
      if(entry.type==='delete'){
        const nodes=restore(project,entry.patch);if(!nodes.length)continue;
        this.future.push({type:'delete',ids:nodes.map(node=>node.id)});this.lastEffect='restored';return nodes;
      }
      const patch=detach(project,entry.ids);if(!patch.nodes.length)continue;
      this.future.push({type:'generate',patch});this.lastEffect='removed';return patch.nodes;
    }
    return [];
  }
  redo(project){
    const entry=this.future.pop();if(!entry)return [];
    if(entry.type==='delete'){
      const patch=detach(project,entry.ids);if(patch.nodes.length)this.past.push({type:'delete',patch});this.lastEffect='removed';return patch.nodes;
    }
    const nodes=restore(project,entry.patch);if(nodes.length)this.past.push({type:'generate',ids:nodes.map(node=>node.id)});this.lastEffect='restored';return nodes;
  }
}
