const unique = values => [...new Set(values)];

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
