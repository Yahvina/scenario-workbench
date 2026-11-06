// 年度覆盖原子台账（src/modules/timeline/override-store.mjs）的专项验收。
// 纯 node:test + node:assert/strict，无 DOM、无网络、不 import docs/research 下的原型。
// 夹具在本文件内自建：线性路径 2026 = 50 → 2035 = 100，scope.years = [2030, 2031, 2035]，
// 所以手算基线 2030 = 650/9 ≈ 72.2222、2031 = 700/9 ≈ 77.7778。
// 每条记录都带 version >= 1 与 provenance.origin ∈ {fixture,user,import,ai}：项目校验器要求如此。

import test from 'node:test';
import assert from 'node:assert/strict';

import { validateProject } from '../src/core/contracts.mjs';
import { interpolate } from '../src/modules/timeline/logic.mjs';
import { displayValue } from '../src/modules/timeline/annual-override.mjs';
import {
  OVERRIDE_MATERIAL_FIELDS,
  OVERRIDE_SLOT_KEY,
  OverrideError,
  createMemoryStorage,
  createOverrideLedger
} from '../src/modules/timeline/override-store.mjs';

const REGION = '示例地区（非真实政策）';
const PATH_ID = 'fixture-path-a';
const BASELINE_2030 = 650 / 9;
const BASELINE_2031 = 700 / 9;

function fixtureProject({ revision = 2 } = {}) {
  const base = {
    version: 1,
    provenance: { origin: 'fixture', sourceId: 'demo-override-test', locator: 'tests/demo-override.test.mjs' }
  };
  const project = {
    schemaVersion: 1,
    contractVersion: '1.0.0',
    id: 'demo-override-fixture',
    title: '年度覆盖台账夹具（非真实政策）',
    revision,
    view: { perspective: 'public', module: 'timeline', objectId: null },
    scope: { regionId: REGION, years: [2030, 2031, 2035] },
    selection: { nodeIds: [], descriptorIds: ['fixture-a'], stateIds: [], lockedStateIds: [] },
    data: { policies: [], taxonomy: [], descriptors: [], states: [], paths: [], judgments: [], evidence: [], mappings: [] }
  };
  project.data.descriptors = [
    { ...base, id: 'fixture-a', label: '示例因素', role: 'input', stateIds: ['fixture-a-1', 'fixture-a-2'], evidenceRefs: [] }
  ];
  project.data.states = [
    {
      ...base, id: 'fixture-a-1', descriptorId: 'fixture-a', label: '示例低档',
      range: { min: 0, max: 60, minInclusive: true, maxInclusive: false },
      unit: '示例单位', validYears: [2030, 2031, 2035], scope: { regionId: REGION }, evidenceRefs: []
    },
    {
      ...base, id: 'fixture-a-2', descriptorId: 'fixture-a', label: '示例高档',
      range: { min: 60, max: 100, minInclusive: true, maxInclusive: true },
      unit: '示例单位', validYears: [2030, 2031, 2035], scope: { regionId: REGION }, evidenceRefs: []
    }
  ];
  project.data.paths = [{
    ...base,
    id: PATH_ID,
    descriptorId: 'fixture-a',
    unit: '示例单位',
    scope: { regionId: REGION },
    interpolation: 'linear',
    points: [
      { year: 2026, value: 50, stateId: 'fixture-a-1', origin: 'user-assumption', evidenceRefs: [] },
      { year: 2035, value: 100, stateId: 'fixture-a-2', origin: 'user-assumption', evidenceRefs: [] }
    ],
    evidenceRefs: []
  }];
  return project;
}

function setup({ origin = 'local', storage = createMemoryStorage() } = {}) {
  const project = fixtureProject();
  const notices = [];
  const ledger = createOverrideLedger({ storage, notify: notice => notices.push(notice) });
  ledger.load(project, { origin });
  return { project, storage, ledger, notices };
}

const setCommand = (ledger, project, extra = {}) => ledger.preview(project, {
  year: 2030, pathId: PATH_ID, value: 75, referenceStateId: 'fixture-a-2',
  declaredBy: '本地使用者', reason: '采用年度覆盖 75', ...extra
});

test('the fixture path is contract-valid and its hand-computed baselines match the task document', () => {
  const project = fixtureProject();
  assert.doesNotThrow(() => validateProject(project));
  const path = project.data.paths[0];
  assert.equal(interpolate(path, 2030).value, BASELINE_2030);
  assert.equal(interpolate(path, 2031).value, BASELINE_2031);
  assert.equal(displayValue(BASELINE_2030), '72.2222');
  assert.equal(displayValue(BASELINE_2031), '77.7778');

  const { ledger } = setup();
  assert.equal(ledger.reading(project, { year: 2030, pathId: PATH_ID }).baseline, BASELINE_2030);
  assert.equal(ledger.reading(project, { year: 2031, pathId: PATH_ID }).baseline, BASELINE_2031);
  // 没有任何覆盖：不是采用状态，采用值为 null（不是 0），operation 为 baseline。
  const empty = ledger.reading(project, { year: 2030, pathId: PATH_ID });
  assert.equal(empty.adopted, false);
  assert.equal(empty.adoptedValue, null);
  assert.equal(empty.value, BASELINE_2030);
  assert.equal(empty.operation, 'baseline');
  assert.equal(empty.recordId, null);
  assert.equal(empty.reason, null);
  assert.equal(empty.historyCount, 0);
});

test('a successful commit persists first, then publishes exactly one record and one notice', () => {
  const { project, storage, ledger, notices } = setup();
  const before = {
    raw: storage.getItem(OVERRIDE_SLOT_KEY),
    revision: project.revision,
    reading: ledger.reading(project, { year: 2030, pathId: PATH_ID })
  };
  const command = setCommand(ledger, project);
  // 命令冻结的是预览当时的身份与版本，不是提交时重新问一遍。
  assert.equal(command.projectId, project.id);
  assert.equal(command.projectRevision, before.revision);
  assert.equal(command.pathId, PATH_ID);
  assert.equal(command.pathVersion, 1);
  assert.equal(command.regionId, REGION);
  assert.equal(command.baselineReading, BASELINE_2030);
  assert.equal(command.slotRaw, before.raw);
  assert.equal(command.operation, 'set');
  assert.equal(command.value, 75);

  const result = ledger.commit(project, command);
  assert.equal(result.status, 'published');
  assert.equal(result.record.id, 'override-1');
  assert.equal(result.record.seq, 1);
  assert.equal(result.record.previousId, null);
  assert.equal(result.record.operation, 'set');
  assert.equal(result.record.value, 75);
  assert.equal(result.record.year, 2030);
  assert.equal(result.record.regionId, REGION);
  assert.equal(result.record.pathVersion, 1);
  assert.equal(result.record.baseline.reading, BASELINE_2030);
  assert.equal(result.record.baseline.method, 'linear');
  assert.equal(result.record.bindingId, null);
  // 没有可核验绑定，所以结论如实待核，不伪造数值判档。
  assert.equal(result.record.verdict.status, 'pending');
  assert.deepEqual(result.record.verdict.candidateStateIds, []);

  // 发布计数与通知各一次，通知载荷就是刚发布的那一条。
  assert.equal(ledger.publishCount(), 1);
  assert.equal(ledger.notifyCount(), 1);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].projectId, project.id);
  assert.equal(notices[0].record.id, 'override-1');
  assert.equal(notices[0].historyCount, 1);
  // 槽位里确实落了盘，且包含项目归属与这条记录。
  assert.notEqual(storage.getItem(OVERRIDE_SLOT_KEY), before.raw);
  const payload = JSON.parse(storage.getItem(OVERRIDE_SLOT_KEY));
  assert.equal(payload.projectId, project.id);
  assert.equal(payload.records.length, 1);
  assert.equal(payload.records[0].value, 75);
  assert.equal(ledger.slotRaw(), storage.getItem(OVERRIDE_SLOT_KEY));

  // 覆盖只作用于这一年。
  assert.equal(ledger.reading(project, { year: 2030, pathId: PATH_ID }).value, 75);
  assert.equal(ledger.reading(project, { year: 2030, pathId: PATH_ID }).adoptedValue, 75);
  assert.equal(ledger.reading(project, { year: 2030, pathId: PATH_ID }).adopted, true);
  assert.equal(ledger.reading(project, { year: 2030, pathId: PATH_ID }).operation, 'set');
  assert.equal(ledger.reading(project, { year: 2030, pathId: PATH_ID }).recordId, 'override-1');
  assert.equal(ledger.reading(project, { year: 2031, pathId: PATH_ID }).value, BASELINE_2031);
  // 规则 9：不显式传地区时按项目地区读数；写对了的覆盖必须读得回来。
  assert.equal(ledger.reading(project, { year: 2030, pathId: PATH_ID }).regionId, REGION);
});

test('a rejected write changes nothing, and the same command can then be retried as record ...-1', () => {
  const { project, storage, ledger, notices } = setup();
  const before = {
    raw: storage.getItem(OVERRIDE_SLOT_KEY),
    revision: project.revision,
    reading: ledger.reading(project, { year: 2030, pathId: PATH_ID })
  };
  const command = setCommand(ledger, project);

  storage.setFail(true);
  const rejected = ledger.commit(project, command);
  assert.equal(rejected.status, 'refused');
  assert.equal(rejected.code, 'WRITE_REJECTED');
  assert.match(rejected.message, /未发布/);

  // 槽位字节、修订、计数、通知、读数、历史全部保持提交前的样子。
  assert.equal(storage.getItem(OVERRIDE_SLOT_KEY), before.raw);
  assert.equal(ledger.slotRaw(), before.raw);
  assert.equal(project.revision, before.revision);
  assert.equal(ledger.publishCount(), 0);
  assert.equal(ledger.notifyCount(), 0);
  assert.equal(notices.length, 0);
  assert.equal(ledger.history(project, { year: 2030, pathId: PATH_ID }).length, 0);
  assert.deepEqual(ledger.reading(project, { year: 2030, pathId: PATH_ID }), before.reading);
  // 写入尝试本身是记了数的：失败发生在落盘之前，而不是失败后偷偷写过。
  assert.equal(storage.writes, 1);

  // 同一条命令重试：编号不跳号。
  storage.setFail(false);
  const retried = ledger.commit(project, command);
  assert.equal(retried.status, 'published');
  assert.equal(retried.record.id, 'override-1');
  assert.equal(ledger.publishCount(), 1);
  assert.equal(ledger.notifyCount(), 1);
  assert.equal(ledger.reading(project, { year: 2030, pathId: PATH_ID }).value, 75);
});

test('identical effective content returns SAME_CONTENT with one record and one notice', () => {
  const { project, storage, ledger, notices } = setup();
  assert.equal(ledger.commit(project, setCommand(ledger, project)).status, 'published');
  const afterFirst = { raw: storage.getItem(OVERRIDE_SLOT_KEY) };

  // 换了理由与时间重提同一个 75：有效内容没变，不算新决定。
  const again = setCommand(ledger, project, { reason: '另一处入口里的同一决定', at: '2026-11-05T02:00:00.000Z' });
  const result = ledger.commit(project, again);
  assert.equal(result.status, 'unchanged');
  assert.equal(result.code, 'SAME_CONTENT');
  assert.equal(result.record.id, 'override-1');
  assert.equal(storage.getItem(OVERRIDE_SLOT_KEY), afterFirst.raw);
  assert.equal(storage.writes, 1);
  assert.equal(ledger.publishCount(), 1);
  assert.equal(ledger.notifyCount(), 1);
  assert.equal(notices.length, 1);
  assert.equal(ledger.history(project, { year: 2030, pathId: PATH_ID }).length, 1);

  // 有效内容字段清单必须真的参与判等：把 value 从 75 改成 76 就得是新记录。
  assert.ok(OVERRIDE_MATERIAL_FIELDS.includes('value'));
  assert.ok(OVERRIDE_MATERIAL_FIELDS.includes('operation'));
  assert.equal(ledger.commit(project, setCommand(ledger, project, { value: 76 })).status, 'published');
  assert.equal(ledger.history(project, { year: 2030, pathId: PATH_ID }).length, 2);
  assert.equal(ledger.publishCount(), 2);
});

test('0 is a real adopted value and is never used to mean revoke', () => {
  const { project, ledger } = setup();
  const zero = setCommand(ledger, project, { value: 0, reason: '把覆盖改成 0：0 是有效值' });
  const result = ledger.commit(project, zero);
  assert.equal(result.status, 'published');
  assert.equal(result.record.value, 0);
  assert.equal(result.record.operation, 'set');
  const adopted = ledger.reading(project, { year: 2030, pathId: PATH_ID });
  assert.equal(adopted.value, 0);
  assert.equal(adopted.adoptedValue, 0);
  assert.equal(adopted.adopted, true);

  // 撤销走的是另一条操作，值必须是 null，而不是 0。
  const revoked = ledger.revoke(project, { year: 2030, pathId: PATH_ID, declaredBy: '本地使用者', reason: '撤销年度覆盖' });
  assert.equal(revoked.status, 'published');
  assert.equal(revoked.record.operation, 'revoke');
  assert.equal(revoked.record.value, null);
  assert.equal(revoked.record.previousId, 'override-1');
  assert.equal(revoked.record.verdict.status, 'baseline');
  const cleared = ledger.reading(project, { year: 2030, pathId: PATH_ID });
  assert.equal(cleared.value, BASELINE_2030);
  assert.equal(cleared.adoptedValue, null);
  assert.equal(cleared.adopted, false);
  assert.equal(cleared.operation, 'revoke');
  assert.equal(cleared.recordId, 'override-2');

  // 空白 / null 是撤销，不是 0：预览把两者分成不同操作。
  assert.equal(ledger.preview(project, { year: 2030, pathId: PATH_ID }).operation, 'revoke');
  assert.equal(ledger.preview(project, { year: 2030, pathId: PATH_ID, value: '   ' }).operation, 'revoke');
  assert.equal(ledger.preview(project, { year: 2030, pathId: PATH_ID, value: 0 }).operation, 'set');
  // 撤销之后历史里 0 那条仍然在，且 value 仍是 0（历史不改写）。
  const chain = ledger.history(project, { year: 2030, pathId: PATH_ID });
  assert.equal(chain.length, 2);
  assert.equal(chain[0].value, 0);
  assert.equal(chain[0].operation, 'set');
});

test('a stale preview is refused with both revisions named, and specific changes beat the generic one', () => {
  const { project, ledger } = setup();
  const command = setCommand(ledger, project);

  const advanced = { ...fixtureProject({ revision: project.revision + 1 }) };
  const stale = ledger.commit(advanced, command);
  assert.equal(stale.status, 'refused');
  assert.equal(stale.code, 'STALE_PREVIEW');
  assert.match(stale.message, /预览时修订为 2/);
  assert.match(stale.message, /当前为 3/);
  assert.equal(ledger.publishCount(), 0);

  // 顺序纪律：路径同时变了，就必须报 PATH_CHANGED，而不是被后面更笼统的过期吞掉。
  const changedPath = fixtureProject({ revision: project.revision + 1 });
  changedPath.data.paths[0].version += 1;
  const pathFirst = ledger.commit(changedPath, command);
  assert.equal(pathFirst.status, 'refused');
  assert.equal(pathFirst.code, 'PATH_CHANGED');
  assert.match(pathFirst.message, /预览为 v1，当前为 v2/);
  assert.equal(ledger.notifyCount(), 0);
  assert.equal(ledger.history(project, { year: 2030, pathId: PATH_ID }).length, 0);
});

test('a changed path version and a same-revision content change are each refused specifically', () => {
  // 路径版本前进（路径内容没变也一样）：PATH_CHANGED。
  const { project, ledger } = setup();
  const command = setCommand(ledger, project);
  const bumped = fixtureProject();
  bumped.data.paths[0].version += 1;
  const pathRefused = ledger.commit(bumped, command);
  assert.equal(pathRefused.status, 'refused');
  assert.equal(pathRefused.code, 'PATH_CHANGED');

  // 修订号不变、路径也没动，但项目里的其他内容变了：SNAPSHOT_CHANGED。
  const snapshotChanged = fixtureProject();
  snapshotChanged.data.evidence.push({
    id: 'fixture-evidence-extra', version: 1,
    provenance: { origin: 'fixture', sourceId: 'demo-override-test', locator: 'tests/demo-override.test.mjs' },
    kind: 'fixture', sourceId: 'demo-override-test', locator: 'tests/demo-override.test.mjs',
    excerpt: '同修订号下的内容变化', evidenceRefs: []
  });
  assert.doesNotThrow(() => validateProject(snapshotChanged));
  const snapshotRefused = ledger.commit(snapshotChanged, command);
  assert.equal(snapshotRefused.status, 'refused');
  assert.equal(snapshotRefused.code, 'SNAPSHOT_CHANGED');
  assert.match(snapshotRefused.message, /修订号相同/);

  // 目标年份不在研究范围：YEAR_OUT_OF_SCOPE。
  const outOfScope = setCommand(ledger, project, { year: 2029 });
  const yearRefused = ledger.commit(project, outOfScope);
  assert.equal(yearRefused.status, 'refused');
  assert.equal(yearRefused.code, 'YEAR_OUT_OF_SCOPE');

  assert.equal(ledger.publishCount(), 0);
  assert.equal(ledger.notifyCount(), 0);
});

test('the slot bytes frozen in the command are checked before any write', () => {
  const { project, ledger, storage } = setup();
  const command = setCommand(ledger, project);
  // 另一个写入者往同一个槽位落了别的内容（这里让台账仍可读，但字节对不上）。
  const other = JSON.stringify({
    format: 'scenario-workbench.annual-overrides', slotVersion: 1,
    projectId: project.id, records: [{ id: 'someone-else-1', seq: 1, value: 42 }]
  });
  storage.setItem(OVERRIDE_SLOT_KEY, other);
  const refused = ledger.commit(project, command);
  assert.equal(refused.status, 'refused');
  assert.equal(refused.code, 'SLOT_CHANGED');
  // 槽位保持对方写下的内容，没被覆盖。
  assert.equal(storage.getItem(OVERRIDE_SLOT_KEY), other);
  // 只记了那一次「别人的写入」：SLOT_CHANGED 在任何写入尝试之前就被发现，台账没有动过存储。
  assert.equal(storage.writes, 1);
});

test('a path version advanced after a save keeps the history but returns the new baseline as current', () => {
  const { project, ledger } = setup();
  assert.equal(ledger.commit(project, setCommand(ledger, project)).status, 'published');
  const before = ledger.reading(project, { year: 2030, pathId: PATH_ID });
  assert.equal(before.value, 75);
  assert.equal(before.adopted, true);
  assert.equal(before.reason, null);
  assert.equal(before.pathVersion, 1);

  // 路径：2035 由 100 改成 120，版本 v1 → v2。2030 新基线 = 50 + 70 * 4/9 = 730/9。
  const advanced = fixtureProject({ revision: project.revision + 1 });
  const path = advanced.data.paths[0];
  path.points.find(point => point.year === 2035).value = 120;
  path.version += 1;

  const after = ledger.reading(advanced, { year: 2030, pathId: PATH_ID });
  assert.equal(after.baseline, 730 / 9);
  assert.equal(after.value, 730 / 9);
  assert.equal(after.adoptedValue, null);
  assert.equal(after.adopted, false);
  assert.equal(after.frozenBaseline, BASELINE_2030);
  assert.equal(after.currentBaseline, 730 / 9);
  assert.equal(after.recordPathVersion, 1);
  assert.equal(after.pathVersion, 2);
  assert.match(after.reason, /^基线已变，待重新采用：/);
  assert.match(after.reason, /覆盖记录停留在路径 v1，当前路径为 v2/);
  assert.match(after.reason, /该年基线已从 72.2222 变为 81.1111/);
  assert.equal(after.operation, 'set');
  assert.equal(after.recordId, 'override-1');

  // 历史照旧可查，而且写下的记录一个字节都没被改写。
  const chain = ledger.history(advanced, { year: 2030, pathId: PATH_ID });
  assert.equal(chain.length, 1);
  assert.equal(chain[0].id, 'override-1');
  assert.equal(chain[0].operation, 'set');
  assert.equal(chain[0].value, 75);
  assert.equal(chain[0].pathVersion, 1);
  assert.equal(chain[0].baseline.reading, BASELINE_2030);
  // 槽位字节也没被这次读数改写。
  assert.deepEqual(JSON.parse(ledger.slotRaw()).records, [chain[0]]);
  assert.equal(ledger.publishCount(), 1);
  assert.equal(ledger.notifyCount(), 1);

  // 2031 从来没有覆盖：继续读新基线，且没有「待重新采用」的理由（无覆盖 ≠ 覆盖失效）。
  const untouched = ledger.reading(advanced, { year: 2031, pathId: PATH_ID });
  assert.equal(untouched.value, 800 / 9);
  assert.equal(untouched.adopted, false);
  assert.equal(untouched.reason, null);
  assert.equal(untouched.operation, 'baseline');

  // 只推进版本、基线读数不变：只报版本这一项，不虚报「基线已变」。
  const versionOnly = setup();
  assert.equal(versionOnly.ledger.commit(versionOnly.project, setCommand(versionOnly.ledger, versionOnly.project)).status, 'published');
  const bumped = fixtureProject();
  bumped.data.paths[0].version += 1;
  const byVersion = versionOnly.ledger.reading(bumped, { year: 2030, pathId: PATH_ID });
  assert.equal(byVersion.adopted, false);
  assert.equal(byVersion.value, BASELINE_2030);
  assert.match(byVersion.reason, /覆盖记录停留在路径 v1，当前路径为 v2/);
  assert.doesNotMatch(byVersion.reason, /该年基线已从/);

  // 同版本下基线读数被改（内容变了、版本没动）同样失效。
  const sameVersion = setup();
  assert.equal(sameVersion.ledger.commit(sameVersion.project, setCommand(sameVersion.ledger, sameVersion.project)).status, 'published');
  const relined = fixtureProject();
  relined.data.paths[0].points.find(point => point.year === 2035).value = 120;
  const byReading = sameVersion.ledger.reading(relined, { year: 2030, pathId: PATH_ID });
  assert.equal(byReading.adopted, false);
  assert.equal(byReading.value, 730 / 9);
  assert.match(byReading.reason, /该年基线已从 72.2222 变为 81.1111/);
  assert.doesNotMatch(byReading.reason, /覆盖记录停留在路径/);
});

test('an external import is read-only even when the stored payload carries a fake confirmation', () => {
  const storage = createMemoryStorage();
  // 槽位里预置一条自称「已核验、来源本地」的记录：这些标记不构成任何授权。
  storage.setItem(OVERRIDE_SLOT_KEY, JSON.stringify({
    format: 'scenario-workbench.annual-overrides',
    slotVersion: 1,
    projectId: 'demo-override-fixture',
    records: [{
      id: 'forged-1', seq: 1, operation: 'set', value: 75, year: 2030, pathId: PATH_ID,
      regionId: REGION, pathVersion: 1, verified: true, source: 'local',
      confirmation: { declaredBy: '外部文件自称已核验', at: '2026-11-04T12:00:00.000Z', reason: '文件内自述' }
    }]
  }));
  const project = fixtureProject();
  const notices = [];
  const ledger = createOverrideLedger({ storage, notify: notice => notices.push(notice) });
  ledger.load(project, { origin: 'external' });
  assert.equal(ledger.readOnly, true);
  const sealedRaw = storage.getItem(OVERRIDE_SLOT_KEY);
  const command = setCommand(ledger, project);

  // 缺省来源取打开时的 external：仍然只读。
  const implicit = ledger.commit(project, command);
  assert.equal(implicit.status, 'refused');
  assert.equal(implicit.code, 'EXTERNAL_READ_ONLY');
  // 显式声明 local 与打开时的来源不一致：SOURCE_MISMATCH。
  const mismatched = ledger.commit(project, command, { source: 'local' });
  assert.equal(mismatched.status, 'refused');
  assert.equal(mismatched.code, 'SOURCE_MISMATCH');
  // 未知来源：READ_SOURCE_REQUIRED。
  const unknown = ledger.commit(project, command, { source: 'imported' });
  assert.equal(unknown.status, 'refused');
  assert.equal(unknown.code, 'READ_SOURCE_REQUIRED');
  // 即使显式传 external 也一样只读，且计数、槽位、历史都没动。
  const explicit = ledger.commit(project, command, { source: 'external' });
  assert.equal(explicit.status, 'refused');
  assert.equal(explicit.code, 'EXTERNAL_READ_ONLY');
  assert.equal(ledger.publishCount(), 0);
  assert.equal(ledger.notifyCount(), 0);
  assert.equal(notices.length, 0);
  // 只读不等于看不见：导入的台账仍然可查（这是查看外部数据的意义），但没有任何写入与通知。
  const imported = ledger.history(project, { year: 2030, pathId: PATH_ID });
  assert.equal(imported.length, 1);
  assert.equal(imported[0].id, 'forged-1');
  assert.equal(imported[0].value, 75);
  // 那条记录里没有真正的基线读数，所以它不作为当前采用值：字段缺失不会被当成「基线没变」。
  const importedReading = ledger.reading(project, { year: 2030, pathId: PATH_ID });
  assert.equal(importedReading.adopted, false);
  assert.equal(importedReading.value, BASELINE_2030);
  assert.match(importedReading.reason, /^基线已变，待重新采用：/);
  assert.equal(ledger.slotRaw(), sealedRaw); // 槽位字节一个标点都没被改写
  assert.equal(JSON.parse(ledger.slotRaw()).records[0].id, 'forged-1');
  assert.equal(JSON.parse(ledger.slotRaw()).records[0].verified, true); // 文件里的自述标记仍在，但没被当作授权

  // 本地显式确认命令之后才允许重新采用。
  assert.equal(ledger.readOnly, true);
  ledger.reAdopt({
    kind: 'local-re-adoption', issuedBy: 'local-command',
    bindingDigest: 'digest-from-local-command', declaredBy: '本地使用者',
    at: '2026-11-05T02:30:00.000Z', reason: '本地确认重新采用'
  });
  assert.equal(ledger.readOnly, false);
  assert.equal(ledger.origin, 'local');
  const published = ledger.commit(project, setCommand(ledger, project), { source: 'local' });
  assert.equal(published.status, 'published');
  assert.equal(ledger.notifyCount(), 1);
  assert.equal(ledger.reading(project, { year: 2030, pathId: PATH_ID }).value, 75);
});

test('a re-adoption command is validated: only a local explicit command is accepted', () => {
  const { ledger } = setup({ origin: 'external' });
  for (const bad of [
    null,
    {},
    { kind: 'local-re-adoption' },
    { kind: 'local-re-adoption', issuedBy: '外部文件', declaredBy: 'x', at: 'y', reason: 'z', bindingDigest: 'd' },
    { kind: 'readopt', issuedBy: 'local-command', declaredBy: 'x', at: 'y', reason: 'z', bindingDigest: 'd' },
    { kind: 'local-re-adoption', issuedBy: 'local-command', declaredBy: '', at: 'y', reason: 'z', bindingDigest: 'd' },
    { kind: 'local-re-adoption', issuedBy: 'local-command', declaredBy: 'x', at: 'y', reason: 'z' }
  ]) {
    assert.throws(() => ledger.reAdopt(bad),
      error => error instanceof OverrideError && error.code === 'INVALID_COMMAND');
  }
  // 文件里带 verified / confirmation / source 的对象同样不是命令。
  assert.throws(
    () => ledger.reAdopt({ issuedBy: 'local-command', verified: true, confirmation: { declaredBy: '自述' }, source: 'local' }),
    error => error instanceof OverrideError && error.code === 'INVALID_COMMAND');
  assert.equal(ledger.readOnly, true);

  const accepted = ledger.reAdopt({
    kind: 'local-re-adoption', issuedBy: 'local-command',
    bindingDigest: 'digest-1', declaredBy: '本地使用者', at: '2026-11-05T02:30:00.000Z', reason: '本地确认'
  });
  assert.equal(accepted.issuedBy, 'local-command');
  assert.equal(ledger.readOnly, false);
  assert.deepEqual(ledger.adoption, accepted);
});

test('load adopts only the matching project and tolerates missing or corrupt bytes', () => {
  const project = fixtureProject();
  const storage = createMemoryStorage();

  // 槽位为空：空台账起步，不抛错。
  const first = createOverrideLedger({ storage });
  assert.deepEqual(first.load(project).records, []);
  assert.equal(first.slotRaw(), null);

  // 坏字节：当作空台账，不抛出去。
  storage.setItem(OVERRIDE_SLOT_KEY, 'not json at all');
  const second = createOverrideLedger({ storage });
  assert.doesNotThrow(() => second.load(project));
  assert.equal(second.history(project, { year: 2030, pathId: PATH_ID }).length, 0);

  // 同一槽位里是别的项目的台账：不采用。
  storage.setItem(OVERRIDE_SLOT_KEY, JSON.stringify({
    format: 'scenario-workbench.annual-overrides', slotVersion: 1,
    projectId: 'another-project', records: [{ id: 'other-1', seq: 1, operation: 'set', value: 9, year: 2030, pathId: PATH_ID, regionId: REGION, pathVersion: 1 }]
  }));
  const third = createOverrideLedger({ storage });
  assert.equal(third.load(project).records.length, 0);
  assert.equal(third.reading(project, { year: 2030, pathId: PATH_ID }).value, BASELINE_2030);

  // 同一项目的台账才被采用，且最旧在前。
  const owner = createOverrideLedger({ storage });
  owner.load(project);
  owner.commit(project, setCommand(owner, project));
  const reopened = createOverrideLedger({ storage });
  const adopted = reopened.load(project);
  assert.equal(adopted.records.length, 1);
  assert.equal(adopted.records[0].id, 'override-1');
  assert.equal(reopened.reading(project, { year: 2030, pathId: PATH_ID }).value, 75);
  // 换了项目：明确报错，绝不把两个项目的覆盖混在一起。
  const other = fixtureProject();
  other.id = 'other-project';
  assert.throws(() => reopened.reading(other, { year: 2030, pathId: PATH_ID }),
    error => error instanceof OverrideError && error.code === 'PROJECT_MISMATCH');

  // 槽名与正式项目键刻意不同，且格式字段可逐项核对。
  assert.equal(OVERRIDE_SLOT_KEY, 'scenario-workbench.annual-overrides.v1');
  assert.equal(/scenario-workbench\.project\.v1/.test(OVERRIDE_SLOT_KEY), false);
  assert.equal(OVERRIDE_MATERIAL_FIELDS.length, 10);
});
