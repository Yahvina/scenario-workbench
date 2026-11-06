// current 基准与政策雄心（R07）：基准年状态从状态定义里选，档位顺序单独记录。
// 不从标签猜大小——「降低能耗」也可能是更高雄心，方向必须由使用者标注。
export const DIRECTIONS = [
  { id: 'back', label: '回退', note: '比基准更松' },
  { id: 'hold', label: '延续', note: '与基准相当' },
  { id: 'more', label: '强化', note: '比基准更紧' }
];

export function ambitionOf(descriptor) {
  const baselineStateId = descriptor?.baseline?.stateId || null;
  const order = Array.isArray(descriptor?.ambition?.order) ? descriptor.ambition.order.filter(id => (descriptor.stateIds || []).includes(id)) : [];
  const full = order.length ? [...order, ...(descriptor.stateIds || []).filter(id => !order.includes(id))] : [...(descriptor.stateIds || [])];
  return { baselineStateId, baseYear: descriptor?.baseline?.year ?? null, source: descriptor?.baseline?.source || null, order: full, explicit: order.length > 0 };
}

export function directionOf(descriptor, stateId) {
  const a = ambitionOf(descriptor);
  if (!a.baselineStateId) return null;
  const i = a.order.indexOf(stateId), b = a.order.indexOf(a.baselineStateId);
  if (i < 0 || b < 0) return null;
  return i < b ? 'back' : i === b ? 'hold' : 'more';
}

export function directionLabel(descriptor, stateId) {
  const id = directionOf(descriptor, stateId);
  return DIRECTIONS.find(d => d.id === id)?.label || null;
}

export function setAmbition(project, descriptorId, { baselineStateId, baseYear, order }) {
  const next = structuredClone(project);
  const descriptor = next.data.descriptors.find(d => d.id === descriptorId);
  if (!descriptor) throw new Error('因素不存在');
  if (baselineStateId !== null && !descriptor.stateIds.includes(baselineStateId)) throw new Error('基准状态不属于这个因素');
  if (order && (order.length !== descriptor.stateIds.length || new Set(order).size !== order.length || order.some(id => !descriptor.stateIds.includes(id)))) throw new Error('档位顺序必须恰好包含这个因素的全部状态');
  descriptor.baseline = baselineStateId ? { stateId: baselineStateId, year: baseYear ?? null, source: 'user-assumption' } : null;
  if (order) descriptor.ambition = { order: [...order] };
  descriptor.version = (descriptor.version || 0) + 1;
  return next;
}

export function moveInOrder(order, index, delta) {
  const next = [...order], target = index + delta;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
