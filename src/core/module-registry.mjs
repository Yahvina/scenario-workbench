export function validateModulePlan(modules) {
  if (!Array.isArray(modules)) throw new Error('Module plan must be an array');
  const byId = new Map();
  for (const item of modules) {
    if (!item.id || byId.has(item.id)) throw new Error('Duplicate or missing module id');
    if (!Array.isArray(item.requires) || !Array.isArray(item.perspectives)) throw new Error('Invalid module contract');
    if (item.perspectives.some(mode => !['public', 'expert'].includes(mode))) throw new Error('Unknown perspective');
    if (!['planned', 'implemented', 'verified'].includes(item.status)) throw new Error('Unknown implementation status');
    byId.set(item.id, item);
  }
  const active = new Set(), done = new Set();
  function visit(id) {
    if (active.has(id)) throw new Error('Circular module dependency: ' + id);
    if (done.has(id)) return;
    const item = byId.get(id);
    if (!item) throw new Error('Missing module dependency: ' + id);
    active.add(id);
    item.requires.forEach(visit);
    active.delete(id);
    done.add(id);
  }
  modules.forEach(item => visit(item.id));
  return true;
}

export function resolveEnabledModules(modules, requestedIds) {
  validateModulePlan(modules);
  const byId = new Map(modules.map(item => [item.id, item]));
  const selected = new Set();
  function add(id) {
    const item = byId.get(id);
    if (!item) throw new Error('Unknown module: ' + id);
    if (selected.has(id)) return;
    item.requires.forEach(add);
    selected.add(id);
  }
  requestedIds.forEach(add);
  return [...selected].map(id => structuredClone(byId.get(id)));
}
