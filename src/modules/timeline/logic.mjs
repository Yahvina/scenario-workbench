export function interpolate(path, year) {
  const points = path.points;
  const exact = points.find(p => p.year === year);
  if (exact) return { ...structuredClone(exact), derived: false };
  const right = points.findIndex(p => p.year > year);
  if (right <= 0 || path.interpolation === 'none') return null;
  const a = points[right - 1], b = points[right];
  if (a.value === null || b.value === null) return null;
  const value = path.interpolation === 'step' ? a.value : a.value + (b.value - a.value) * (year - a.year) / (b.year - a.year);
  return { year, value, stateId: null, origin: 'interpolated', evidenceRefs: [...new Set([...a.evidenceRefs, ...b.evidenceRefs])], derived: true };
}

export function draftOf(path) {
  return { unit: path.unit ?? '', interpolation: path.interpolation, points: path.points.map((p, index) => ({ ...structuredClone(p), year: String(p.year), value: p.value === null ? '' : String(p.value), originalIndex: index })) };
}

export function parseDraft(draft, descriptorId, states) {
  if (!['none', 'linear', 'step'].includes(draft.interpolation)) throw new Error('插值方式无效');
  const years = new Set();
  const points = draft.points.map(p => {
    const year = Number(p.year), text = String(p.value).trim(), value = text === '' ? null : Number(text);
    if (String(p.year).trim() === '' || !Number.isInteger(year) || year < 1900 || year > 2300) throw new Error('年份须为1900—2300的整数');
    if (years.has(year)) throw new Error('年份重复，请修正后保存');
    years.add(year);
    if (value !== null && !Number.isFinite(value)) throw new Error('数值须为有限数字，空白表示缺失');
    if (p.stateId !== null && !states.some(s => s.id === p.stateId && s.descriptorId === descriptorId)) throw new Error('状态不属于当前变量');
    return { year, value, stateId: p.stateId, origin: p.origin, evidenceRefs: [...p.evidenceRefs], originalIndex: p.originalIndex };
  });
  points.sort((a, b) => a.year - b.year);
  return { unit: draft.unit.trim() || null, interpolation: draft.interpolation, points };
}

export function buildChange(project, original, draft, descriptorId, newId) {
  if (!project.selection.descriptorIds.includes(descriptorId)) throw new Error('该变量已不在当前选择中');
  const parsed = parseDraft(draft, descriptorId, project.data.states);
  const before = original || null;
  const pathId = original?.id || newId();
  const next = structuredClone(project);
  const changedPoints = parsed.points.map(p => {
    const old = original?.points[p.originalIndex];
    const changed = !old || old.year !== p.year || old.value !== p.value || old.stateId !== p.stateId;
    return { year: p.year, value: p.value, stateId: changed ? null : p.stateId, origin: changed ? 'user-assumption' : p.origin, evidenceRefs: [...p.evidenceRefs] };
  });
  const candidate = { ...(original || { id: pathId, descriptorId, scope: structuredClone(project.scope.regionId === null ? { regionId: null } : { regionId: project.scope.regionId }), evidenceRefs: [], version: 1, provenance: { origin: 'user' } }), unit: parsed.unit, interpolation: parsed.interpolation, points: changedPoints };
  if (original && JSON.stringify({ ...candidate, version: original.version }) === JSON.stringify(original)) return next;
  const evidenceId = newId(), locator = pathId + '@v' + (original?.version || 0);
  candidate.version = original ? original.version + 1 : 1;
  candidate.provenance = { origin: 'user', sourceId: pathId, locator };
  candidate.evidenceRefs = [...new Set([...candidate.evidenceRefs, evidenceId])];
  candidate.points.forEach((p, i) => {
    const old = original?.points[parsed.points[i].originalIndex];
    if (!old || p.year !== old.year || p.value !== old.value || p.stateId !== old.stateId) p.evidenceRefs = [...new Set([...p.evidenceRefs, evidenceId])];
  });
  const evidence = { id: evidenceId, kind: 'user-assumption', sourceId: pathId, locator, excerpt: JSON.stringify({ explanation: '用户路径修改记录，非文献依据；数值/年份编辑后状态待核。', before, after: candidate }), reviewStatus: 'draft', version: 1, provenance: { origin: 'user', sourceId: pathId } };
  next.data.evidence.push(evidence);
  const index = next.data.paths.findIndex(p => p.id === pathId);
  if (index < 0) next.data.paths.push(candidate); else next.data.paths[index] = candidate;
  return next;
}

export function chartDomain(years, points) {
  const xs = [...years, ...points.map(p => p.year)].filter(Number.isFinite);
  const ys = points.map(p => p.value).filter(v => v !== null && Number.isFinite(v));
  let minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  if (!xs.length) return null;
  if (minX === maxX) { minX -= 1; maxX += 1; }
  if (!ys.length) { minY = -1; maxY = 1; }
  else { const pad = (maxY - minY || Math.max(Math.abs(minY), 1)) * .15; minY -= pad; maxY += pad; }
  return { minX, maxX, minY, maxY, hasValues: ys.length > 0 };
}
