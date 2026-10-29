import {clone,descendantsOf} from './domain.js';

// Store generated IDs rather than project snapshots: undo must not rewind later edits.
export class GenerationHistory{
  constructor(){this.clear();}
  clear(){this.past=[];this.future=[];}
  record(nodes){
    if(!nodes.length)return;
    this.past.push(nodes.map(node=>node.id));
    if(this.past.length>60)this.past.shift();
    this.future=[];
  }
  canUndo(project){return this.past.some(ids=>project.nodes.some(node=>ids.includes(node.id)));}
  canRedo(){return this.future.length>0;}
  undo(project){
    let ids;
    do{ids=this.past.pop();}while(ids&&!project.nodes.some(node=>ids.includes(node.id)));
    if(!ids)return [];
    const removed=new Set(ids),nodes=clone(project.nodes.filter(node=>removed.has(node.id)));
    const edges=clone(project.edges.filter(edge=>removed.has(edge.from)||removed.has(edge.to)));
    const detached=[];
    project.nodes=project.nodes.filter(node=>!removed.has(node.id));
    for(const node of project.nodes){
      if(!node.parentIds.some(id=>removed.has(id)))continue;
      const beforeParents=[...node.parentIds],merged=!!node.merged;
      node.parentIds=node.parentIds.filter(id=>!removed.has(id));
      if(node.parentIds.length<2)node.merged=false;
      detached.push({id:node.id,beforeParents,afterParents:[...node.parentIds],merged});
    }
    project.edges=project.edges.filter(edge=>!removed.has(edge.from)&&!removed.has(edge.to));
    this.future.push({nodes,edges,detached});
    return nodes;
  }
  redo(project){
    const patch=this.future.pop();if(!patch)return [];
    const present=new Set(project.nodes.map(node=>node.id));
    const nodes=clone(patch.nodes.filter(node=>!present.has(node.id)));
    const restored=new Set(nodes.map(node=>node.id));
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
      if(node&&attachable.has(node.id))node.merged=saved.merged&&node.parentIds.length>1;
    }
    if(nodes.length)this.past.push(nodes.map(node=>node.id));
    return nodes;
  }
}
