import { inspectInput } from './engine.mjs';
import { compareScores } from './score-sensitivity.mjs';

export const jointPlanKey = 'scenario-workbench.joint-plans.v1';
const canonical = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ?
  Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
export const sameBaseline = (a, b) => canonical(a) === canonical(b);

function validate(record) {
  if (!record || typeof record.id !== 'string' || !record.id || typeof record.name !== 'string' ||
    !record.name.trim() || record.name.length > 60 || typeof record.createdAt !== 'string') throw new Error('保存的联合方案格式不完整。');
  inspectInput(record.input);
  if (!Array.isArray(record.changes) || record.changes.length < 2 ||
    new Set(record.changes.map(c => c?.entryIndex)).size !== record.changes.length ||
    record.changes.some(c => !Number.isInteger(c?.entryIndex) || !record.input.matrix.entries[c.entryIndex] ||
      !Number.isInteger(c.score) || Math.abs(c.score) > 3 || record.input.matrix.entries[c.entryIndex].score === c.score)) {
    throw new Error('联合方案至少需要两格不同且有效的改分。');
  }
}

export function readJointPlans(storage) {
  const raw = storage.getItem(jointPlanKey);
  if (raw === null) return [];
  let saved;
  try { saved = JSON.parse(raw); } catch { throw new Error('联合方案存储损坏；原记录未覆盖。'); }
  if (saved?.version !== 1 || !Array.isArray(saved.records) || saved.records.length > 12) throw new Error('联合方案存储版本或数量无效；原记录未覆盖。');
  saved.records.forEach(validate);
  if (new Set(saved.records.map(r => r.id)).size !== saved.records.length) throw new Error('联合方案标识重复；原记录未覆盖。');
  return structuredClone(saved.records);
}

function write(storage, records) {
  const text = JSON.stringify({ version: 1, records });
  if (new TextEncoder().encode(text).length > 2000000) throw new Error('联合方案存储超过2MB，请先删除不再需要的方案。');
  try { storage.setItem(jointPlanKey, text); }
  catch { throw new Error('本机存储空间不足或不可写，原记录未覆盖；请先导出需要保留的比较。'); }
}

export function saveJointPlan(storage, { name, input, changes, id = globalThis.crypto.randomUUID(), createdAt = new Date().toISOString() }) {
  const records = readJointPlans(storage);
  if (records.length >= 12) throw new Error('最多保存12份联合方案，请先删除不再需要的方案。');
  const record = structuredClone({ id, name: typeof name === 'string' ? name.trim() : '', createdAt, input, changes });
  validate(record);
  if (records.some(r => r.id === record.id)) throw new Error('方案标识已存在。');
  if (records.some(r => r.name === record.name && sameBaseline(r.input, input))) throw new Error('该基线已有同名联合方案，请使用其他名称。');
  write(storage, [...records, record]);
  return record;
}

export function deleteJointPlan(storage, id) {
  const records = readJointPlans(storage);
  write(storage, records.filter(r => r.id !== id));
}

export function loadJointPlan(input, record) {
  validate(record);
  if (!sameBaseline(input, record.input)) throw new Error('方案属于另一冻结基线，不能直接载入；请使用原基线重新检验。');
  return structuredClone(record.changes);
}

export function compareJointPlans(input, left, right) {
  if (!left || !right) throw new Error('请先保存并选择两份联合方案。');
  if (left.id === right.id) throw new Error('请选择两份不同的联合方案。');
  const results = [left, right].map(record => ({ id: record.id, name: record.name,
    result: compareScores(input, loadJointPlan(input, record)) }));
  const key = c => JSON.stringify(input.activeDescriptorIds.map(id => c[id]));
  const rows = results.map(p => [...p.result.kept, ...p.result.added]);
  const sets = rows.map(configs => new Set(configs.map(key)));
  return { version: 1, method: 'saved-joint-plan-comparison', input: structuredClone(input), plans: results,
    between: { kept: rows[0].filter(c => sets[1].has(key(c))),
      onlyLeft: rows[0].filter(c => !sets[1].has(key(c))), onlyRight: rows[1].filter(c => !sets[0].has(key(c))) } };
}

export function exportJointPlans(storage) {
  return { format: 'scenario-workbench.joint-plans', version: 1, records: readJointPlans(storage) };
}

export function importJointPlans(storage, raw) {
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > 2000000) throw new Error('联合方案备份超过2MB或不是文本。');
  let incoming;
  try { incoming = JSON.parse(raw); } catch { throw new Error('备份不是有效JSON，原记录未覆盖。'); }
  if (incoming?.format !== 'scenario-workbench.joint-plans' || incoming.version !== 1) throw new Error('不支持的联合方案备份格式或版本。');
  const records = readJointPlans({ getItem: () => JSON.stringify({ version: incoming.version, records: incoming.records }) });
  const current = readJointPlans(storage);
  const merged = [...current];
  for (const record of records) {
    const old = merged.find(r => r.id === record.id);
    if (old) {
      if (!sameBaseline(old, record)) throw new Error('方案标识冲突，整批未导入：' + record.name);
      continue;
    }
    if (merged.some(r => r.name === record.name && sameBaseline(r.input, record.input))) throw new Error('同一基线存在同名方案，整批未导入：' + record.name);
    merged.push(record);
  }
  if (merged.length > 12) throw new Error('合并后超过12份，原记录未覆盖。');
  if (merged.length !== current.length) write(storage, merged);
  return { added: merged.length - current.length, total: merged.length };
}
