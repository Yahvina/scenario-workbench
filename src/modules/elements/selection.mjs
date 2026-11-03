const unique = values => [...new Set(values)];

export function descendantChoices(project,nodeId){
 const visited=new Set(),nodeIds=[],descriptorIds=[];
 function visit(id){if(visited.has(id))return;visited.add(id);const node=project.data.taxonomy.find(n=>n.id===id);if(!node)return;
  if(id!==nodeId&&node.descriptorIds.length&&node.descriptorIds.every(did=>{const d=project.data.descriptors.find(d=>d.id===did);return d?.stateIds.length&&d.stateIds.every(sid=>project.data.states.some(s=>s.id===sid&&s.descriptorId===did));})){nodeIds.push(id);descriptorIds.push(...node.descriptorIds);}
  node.childIds.forEach(visit);
 }
 visit(nodeId);return {nodeIds,descriptorIds:unique(descriptorIds),descendantIds:[...visited].filter(id=>id!==nodeId)};
}

export function resolveSelection(project, nodeIds) {
  const nodes = new Map(project.data.taxonomy.map(node => [node.id, node]));
  const selected = unique(nodeIds).filter(id => nodes.has(id));
  const descriptorIds = unique(selected.flatMap(id => nodes.get(id).descriptorIds));
  const active = new Set(descriptorIds);
  const states = new Map(project.data.states.map(state => [state.id, state]));
  const keep = ids => ids.filter(id => active.has(states.get(id)?.descriptorId));
  return { nodeIds: selected, descriptorIds, stateIds: keep(project.selection.stateIds), lockedStateIds: keep(project.selection.lockedStateIds) };
}

export function visibleRows(taxonomy, expanded, query = '') {
  const nodes = new Map(taxonomy.map(node => [node.id, node]));
  const term = query.trim().toLocaleLowerCase();
  const included = new Set();
  function include(id) {
    if (included.has(id)) return;
    included.add(id);
    nodes.get(id)?.parentIds.forEach(include);
  }
  if (term) taxonomy.filter(node => (node.label + ' ' + node.id).toLocaleLowerCase().includes(term)).forEach(node => include(node.id));
  const rows = [];
  function walk(id, depth, ancestors, path) {
    const node = nodes.get(id);
    if (!node || ancestors.has(id) || (term && !included.has(id))) return;
    const key = JSON.stringify([...path, id]);
    rows.push({ node, depth, key });
    if (term || expanded.has(id)) node.childIds.forEach(child => walk(child, depth + 1, new Set([...ancestors, id]), [...path, id]));
  }
  taxonomy.filter(node => !node.parentIds.length).forEach(node => walk(node.id, 1, new Set(), []));
  return rows;
}
