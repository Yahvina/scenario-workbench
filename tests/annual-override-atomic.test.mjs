import test from 'node:test';
import assert from 'node:assert/strict';
import { interpolate } from '../src/modules/timeline/logic.mjs';
import { classifyOverride, displayValue } from '../src/modules/timeline/annual-override.mjs';
import { bindingUsable, historyEntries, readSource as readSourceFromCompat, toSnapshotV1, validateProjectV2 } from '../docs/research/annual-override/compat.mjs';
import {
  ATOMIC_BINDING_ID,
  ATOMIC_PATH_ID,
  ATOMIC_SLOT_KEY,
  AtomicError,
  bindingVersionOf,
  buildArchiveV2,
  createAtomicWriter,
  createMemoryStorage,
  createProjectSlot,
  createReAdoption,
  describeValue,
  atomicFixtureV2,
  isCurrent,
  snapshotOf
} from '../docs/research/annual-override/atomic-write.mjs';

const BASELINE_2030 = 650 / 9;
const BASELINE_2031 = 700 / 9;

function fixture() {
  const project = atomicFixtureV2();
  const storage = createMemoryStorage();
  const slot = createProjectSlot(storage);
  const seeded = slot.seed(project);
  const notices = [];
  const writer = createAtomicWriter({ storage, notify: notice => notices.push(notice) });
  writer.open(project, { slotRaw: seeded });
  return { project, storage, slot, writer, notices };
}

const setCommand = (writer, extra = {}) => writer.preview({
  operation: 'set', year: 2030, pathId: ATOMIC_PATH_ID, bindingId: ATOMIC_BINDING_ID,
  referenceStateId: 'compat-a-2', value: 75, reason: '采用年度覆盖 75', ...extra
});

test('the hand-computed baselines and the fixture path match the task document', () => {
  const { writer, project } = fixture();
  const path = project.data.paths.find(item => item.id === ATOMIC_PATH_ID);
  assert.equal(interpolate(path, 2030).value, BASELINE_2030);
  assert.equal(interpolate(path, 2031).value, BASELINE_2031);
  assert.equal(displayValue(BASELINE_2030), '72.2222');
  assert.equal(displayValue(BASELINE_2031), '77.7778');
  assert.deepEqual(writer.reading({ year: 2030 }).value, BASELINE_2030);
  assert.deepEqual(writer.reading({ year: 2031 }).value, BASELINE_2031);
  // 2030 是插值点、没有任何覆盖记录：currentOperation 为 baseline、value 为 null。
  assert.deepEqual(writer.reading({ year: 2030 }).override, { operation: 'baseline', value: null, recordId: null });
});

test('a successful set persists first, then publishes exactly one new snapshot and one notice', () => {
  const { writer, storage, notices } = fixture();
  const before = { raw: storage.getItem(ATOMIC_SLOT_KEY), revision: writer.revision };
  const command = setCommand(writer);
  assert.equal(command.revision, before.revision);
  assert.equal(command.baselineReading, BASELINE_2030);

  const result = writer.commit(command);
  assert.equal(result.status, 'published');
  assert.equal(result.record.operation, 'set');
  assert.equal(result.record.value, 75);
  assert.equal(result.record.previousId, null);
  assert.equal(result.record.seq, 1);
  assert.equal(result.record.baseline.reading, BASELINE_2030);
  assert.equal(result.record.baseline.method, 'linear');
  assert.equal(result.record.verdict.status, 'within');

  // 修订只增一次；内存与槽位都是新内容；通知恰好一次，且发布的就是新快照。
  assert.equal(writer.revision, before.revision + 1);
  assert.equal(writer.publishCount, 1);
  assert.equal(writer.notifyCount, 1);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].revision, writer.revision);
  assert.deepEqual(writer.published[0], notices[0]);
  assert.notEqual(storage.getItem(ATOMIC_SLOT_KEY), before.raw);
  assert.deepEqual(JSON.parse(storage.getItem(ATOMIC_SLOT_KEY)), writer.project);

  // 2030 读覆盖值，2031 仍读原路径基线：覆盖只作用于这一年。
  assert.equal(writer.reading({ year: 2030 }).value, 75);
  assert.deepEqual(writer.reading({ year: 2030 }).override, { operation: 'set', value: 75, recordId: 'c2b-override-1' });
  assert.equal(writer.reading({ year: 2031 }).value, BASELINE_2031);
  assert.deepEqual(writer.reading({ year: 2031 }).override, { operation: 'baseline', value: null, recordId: null });
});

test('a rejected write changes nothing and the same command can be retried', () => {
  const { writer, storage, notices } = fixture();
  const before = { raw: storage.getItem(ATOMIC_SLOT_KEY), revision: writer.revision };
  const archiveBefore = toSnapshotV1(writer.project);

  storage.setFail(true);
  const command = setCommand(writer);
  const rejected = writer.commit(command);
  assert.equal(rejected.status, 'refused');
  assert.equal(rejected.code, 'WRITE_REJECTED');
  assert.match(rejected.message, /模拟存储拒绝/);

  // 项目、槽位字节、修订号、通知次数、旧运行当前性全部不变。
  assert.equal(storage.getItem(ATOMIC_SLOT_KEY), before.raw);
  assert.equal(writer.revision, before.revision);
  assert.equal(writer.publishCount, 0);
  assert.equal(writer.notifyCount, 0);
  assert.equal(notices.length, 0);
  assert.equal(writer.project.data.annualOverrides.length, 0);
  assert.ok(isCurrent(writer.project, snapshotOf(writer.project)));
  assert.equal(writer.reading({ year: 2030 }).value, BASELINE_2030);

  // 重试同一条命令：草稿未变，成功后才发布。
  storage.setFail(false);
  const retried = writer.commit(command);
  assert.equal(retried.status, 'published');
  assert.equal(retried.record.id, 'c2b-override-1');
  assert.equal(writer.revision, before.revision + 1);
  assert.equal(writer.notifyCount, 1);
  assert.equal(writer.reading({ year: 2030 }).value, 75);
  // 撤销一次覆盖之后 2030 回到基线，旧运行快照也不再当前。
  assert.equal(archiveBefore.revision, before.revision);
  assert.equal(isCurrent(writer.project, archiveBefore), false);
});

test('saving the same effective content twice returns the original snapshot without touching the slot', () => {
  const { writer, storage, notices } = fixture();
  const first = setCommand(writer);
  assert.equal(writer.commit(first).status, 'published');
  const afterFirst = { raw: storage.getItem(ATOMIC_SLOT_KEY), revision: writer.revision };

  const same75 = setCommand(writer, { reason: '另一次会话里的同一决定' });
  const result = writer.commit(same75);
  assert.equal(result.status, 'unchanged');
  assert.equal(result.code, 'SAME_CONTENT');
  assert.equal(result.record.id, 'c2b-override-1');
  assert.equal(storage.getItem(ATOMIC_SLOT_KEY), afterFirst.raw);
  assert.equal(writer.revision, afterFirst.revision);
  assert.equal(writer.publishCount, 1);
  assert.equal(writer.notifyCount, 1);
  assert.equal(notices.length, 1);

  // 0 是与「撤销」和「未判断」都不同的有效值，因此 75 → 0 必须真的写入。
  const zero = setCommand(writer, { value: 0, reason: '把覆盖改成 0：0 是有效值' });
  const zeroResult = writer.commit(zero);
  assert.equal(zeroResult.status, 'published');
  assert.equal(zeroResult.record.value, 0);
  assert.equal(zeroResult.record.previousId, 'c2b-override-1');
  // 0 有效，但已不在原对照状态 compat-a-2（[60,100]）内：判定如实给出越界，不按 0 特殊化。
  assert.equal(zeroResult.record.verdict.status, 'out-of-range');
  assert.deepEqual(zeroResult.record.verdict.candidateStateIds, ['compat-a-1']);
  assert.equal(writer.reading({ year: 2030 }).value, 0);
  assert.equal(writer.reading({ year: 2031 }).value, BASELINE_2031);

  // 再次提交同一个 0：原样返回，不再追加第二条。
  const again = setCommand(writer, { value: 0, reason: '重复保存同一个 0' });
  const repeat = writer.commit(again);
  assert.equal(repeat.status, 'unchanged');
  assert.equal(repeat.record.id, 'c2b-override-2');
  assert.equal(writer.project.data.annualOverrides.length, 2);
  assert.equal(writer.notifyCount, 2);

  const undo = writer.preview({
    operation: 'revoke', year: 2030, pathId: ATOMIC_PATH_ID, bindingId: ATOMIC_BINDING_ID,
    reason: '撤销年度覆盖'
  });
  const revoked = writer.commit(undo);
  assert.equal(revoked.status, 'published');
  assert.equal(revoked.record.operation, 'revoke');
  assert.equal(revoked.record.value, null);
  assert.equal(revoked.record.previousId, 'c2b-override-2');
  assert.equal(revoked.record.verdict.status, 'baseline');
  assert.equal(writer.reading({ year: 2030 }).value, BASELINE_2030);
  assert.equal(writer.reading({ year: 2031 }).value, BASELINE_2031);
  // 三个有效提交各加一修订，重复相同确认不加。
  assert.equal(writer.revision, 5);
  assert.equal(writer.publishCount, 3);
  assert.equal(writer.notifyCount, 3);
});

test('the same sequence matches the display strings the rules document promises', () => {
  const { writer } = fixture();
  const baseline2030 = writer.reading({ year: 2030 }).baseline;
  const baseline2031 = writer.reading({ year: 2031 }).baseline;
  assert.equal(displayValue(baseline2030), '72.2222');
  assert.equal(displayValue(baseline2031), '77.7778');

  // P7-B 的 classifyOverride 需要 purpose 等 C2A 绑定没有的字段：直接套用只会得到待核，
  // 这正是「不为 C2A 绑定伪造字段」的依据。
  const adopted = classifyOverride({ baseline: baseline2030, override: 75, binding: null, states: [] });
  assert.equal(adopted.verdict, 'pending');
  assert.match(adopted.reasons[0], /缺少显式指标绑定/);
  assert.equal(displayValue(75), '75');

  const adopted75 = writer.commit(setCommand(writer));
  assert.equal(adopted75.record.verdict.detail, '采用值 75 仍在原状态「compat-a-2」的区间 [60, 100] 示例单位 内。');
  const zero = writer.commit(setCommand(writer, { value: 0 }));
  assert.equal(zero.record.verdict.status, 'out-of-range');
  assert.equal(writer.reading({ year: 2030 }).value, 0);
  assert.equal(writer.reading({ year: 2031 }).value, BASELINE_2031);
  const cleared = writer.commit(writer.preview({ operation: 'revoke', year: 2030, pathId: ATOMIC_PATH_ID, reason: '撤销' }));
  assert.equal(cleared.record.verdict.status, 'baseline');
  assert.match(cleared.record.verdict.detail, /回到该年基线 72.2222/);
  // 0 与空白是两条不同的读法：0 命中区间内的一档，撤销回到 650/9。
  assert.notEqual(displayValue(0), displayValue(null));
  assert.equal(displayValue(writer.reading({ year: 2030 }).value), displayValue(BASELINE_2030));
});

test('a stale preview, a changed path, a changed binding and a same-version rewrite are all refused', () => {
  const { writer } = fixture();
  const stale = setCommand(writer);
  // 修订号相同也不行：完整项目快照变化必须按陈旧预览拒绝。
  writer.mutate(project => {
    project.data.evidence.push({
      id: 'c2b-evidence-extra', version: 1,
      provenance: { origin: 'fixture', sourceId: 'atomic-test', locator: 'tests/annual-override-atomic.test.mjs' },
      kind: 'fixture', sourceId: 'atomic-test', locator: 'tests/annual-override-atomic.test.mjs', excerpt: '同修订下的内容变化', evidenceRefs: []
    });
  }, { bumpRevision: false });
  const changed = writer.commit(stale);
  assert.equal(changed.status, 'refused');
  assert.equal(changed.code, 'SNAPSHOT_CHANGED');
  assert.match(changed.message, /修订号相同/);
  assert.equal(writer.revision, 2);

  // 修订号前进（其他入口保存过）：同一份旧预览按陈旧预览拒绝，不按快照变化。
  const { writer: w0 } = fixture();
  const staleRevision = setCommand(w0);
  w0.mutate(project => { project.title = '另一个入口改过的名称'; });
  const revisionRefused = w0.commit(staleRevision);
  assert.equal(revisionRefused.status, 'refused');
  assert.equal(revisionRefused.code, 'STALE_PREVIEW');
  assert.match(revisionRefused.message, /预览时修订为 2，当前为 3/);
  assert.equal(w0.notifyCount, 0);

  // 槽位被另一个写者改动（内存未变）：按槽位变化拒绝。
  const { writer: w6, slot: s6 } = fixture();
  const staleSlot = setCommand(w6);
  const other = atomicFixtureV2();
  other.revision = 7;
  s6.seed(other);
  const slotRefused = w6.commit(staleSlot);
  assert.equal(slotRefused.status, 'refused');
  assert.equal(slotRefused.code, 'SLOT_CHANGED');
  assert.equal(w6.publishCount, 0);

  // 重新打开后：路径版本变化与绑定版本变化各自被拒。
  const { writer: w2 } = fixture();
  const stalePath = setCommand(w2);
  w2.mutate(project => { project.data.paths.find(item => item.id === ATOMIC_PATH_ID).version += 1; });
  const pathRefused = w2.commit(stalePath);
  assert.equal(pathRefused.status, 'refused');
  assert.equal(pathRefused.code, 'PATH_CHANGED');

  const { writer: w3 } = fixture();
  const staleBinding = setCommand(w3);
  w3.mutate(project => { project.data.indicatorBindings[0].unit = '另一单位'; });
  const bindingRefused = w3.commit(staleBinding);
  assert.equal(bindingRefused.status, 'refused');
  assert.equal(bindingRefused.code, 'BINDING_CHANGED');

  // 同版本内容变化：改了状态区间但版本号不动，同样拒绝。
  const { writer: w4 } = fixture();
  const staleState = setCommand(w4);
  w4.mutate(project => { project.data.states.find(item => item.id === 'compat-a-2').range.max = 90; });
  const stateRefused = w4.commit(staleState);
  assert.equal(stateRefused.status, 'refused');
  assert.equal(stateRefused.code, 'BINDING_NOT_USABLE');
  assert.match(stateRefused.message, /状态定义内容与冻结定义不一致（同版本 v1）：compat-a-2/);

  // 目标年份不在当前范围：同样不发布。
  const { writer: w5 } = fixture();
  const outOfScope = setCommand(w5, { year: 2029 });
  const outRefused = w5.commit(outOfScope);
  assert.equal(outRefused.status, 'refused');
  assert.equal(outRefused.code, 'YEAR_OUT_OF_SCOPE');
  assert.equal(w5.revision, 2);
  assert.equal(w5.notifyCount, 0);
});

test('an external import is read-only and re-adoption needs a local explicit confirmation command', () => {
  const project = atomicFixtureV2();
  const storage = createMemoryStorage();
  const seeded = createProjectSlot(storage).seed(project);
  const writer = createAtomicWriter({ storage });
  writer.open(project, { origin: 'external', slotRaw: seeded });

  // 不传读取来源时按打开项目时的来源（external），仍由外部只读规则拦住；
  // 显式声明 local 与 open 时的来源不一致，按来源不一致拒绝（两者都不写入）。
  const implicit = writer.commit(setCommand(writer));
  assert.equal(implicit.status, 'refused');
  assert.equal(implicit.code, 'EXTERNAL_READ_ONLY');
  const mismatched = writer.commit(setCommand(writer), { source: 'local' });
  assert.equal(mismatched.status, 'refused');
  assert.equal(mismatched.code, 'SOURCE_MISMATCH');
  // 两次拒绝都不改内存、不写槽位、不通知。
  assert.equal(writer.revision, project.revision);
  assert.equal(writer.publishCount, 0);
  assert.equal(writer.notifyCount, 0);

  // readSource 本身仍要求显式来源：文件里的声明不能自行选择入口。
  assert.throws(() => readSourceFromCompat({}), error => error.code === 'READ_SOURCE_REQUIRED');

  // 文件里的 verified / confirmation / source 都不构成授权；外部导入只能查看。
  const forged = writer.project;
  forged.data.indicatorBindings[0].verified = true;
  forged.data.indicatorBindings[0].confirmation = {
    declaredBy: '外部文件自称已核验', at: '2026-11-04T12:00:00.000Z', reason: '文件内 verified=true，未经当前确认'
  };
  const external = writer.commit(setCommand(writer), { source: 'external' });
  assert.equal(external.status, 'refused');
  assert.equal(external.code, 'EXTERNAL_READ_ONLY');
  assert.equal(writer.readOnly, true);
  assert.equal(writer.revision, 2);
  assert.equal(writer.notifyCount, 0);

  // 空泛的「重新采用」对象不够：必须是本地签发的确认命令。
  assert.throws(() => writer.reAdopt({ kind: 'local-re-adoption', issuedBy: '外部文件', bindingId: ATOMIC_BINDING_ID }),
    error => error instanceof AtomicError && error.code === 'INVALID_COMMAND');

  const binding = writer.project.data.indicatorBindings[0];
  const command = createReAdoption(binding, {
    declaredBy: '本地使用者', at: '2026-11-04T12:30:00.000Z', reason: '本地确认重新采用该绑定'
  });
  writer.reAdopt(command);
  assert.equal(writer.readOnly, false);
  assert.equal(writer.origin, 'local');
  assert.equal(writer.adoption.bindingId, ATOMIC_BINDING_ID);
  assert.equal(writer.adoption.issuedBy, 'local-command');

  // 确认命令与本地已签发的不一致：仍然拒绝。
  const mismatch = writer.commit(setCommand(writer), { adoption: { ...command, bindingDigest: 'deadbeef' } });
  assert.equal(mismatch.status, 'refused');
  assert.equal(mismatch.code, 'INVALID_COMMAND');

  const published = writer.commit(setCommand(writer), { adoption: command });
  assert.equal(published.status, 'published');
  assert.equal(writer.notifyCount, 1);
  assert.equal(writer.reading({ year: 2030 }).value, 75);

  // 绑定内容换了以后，旧确认命令失效。
  const changed = writer.project;
  changed.data.indicatorBindings[0].unit = '另一单位';
  createProjectSlot(storage).write(changed, createProjectSlot(storage).readRaw());
  writer.restore();
  writer.open(changed, { origin: 'local', slotRaw: storage.getItem(ATOMIC_SLOT_KEY) });
  assert.throws(() => writer.reAdopt(command), error => error instanceof AtomicError && error.code === 'BINDING_CHANGED');
});

test('the frozen history chain survives a write failure and keeps prior entries readable', () => {
  const { writer, storage } = fixture();
  assert.equal(writer.commit(setCommand(writer)).status, 'published');
  storage.setFail(true);
  const failed = writer.commit(setCommand(writer, { value: 0, reason: '写失败的那一次' }));
  assert.equal(failed.status, 'refused');
  storage.setFail(false);

  const chain = historyEntries(writer.project);
  assert.equal(chain.overrides.length, 1);
  assert.deepEqual(chain.overrides[0].key, [writer.project.scope.regionId, ATOMIC_PATH_ID, 2030]);
  assert.equal(chain.overrides[0].operation, 'set');
  assert.equal(chain.overrides[0].value, 75);
  assert.deepEqual(chain.overrides[0].frozenBaseline, { reading: BASELINE_2030, method: 'linear', originYear: 2030, evidenceRefs: [] });
  assert.equal(chain.overrides[0].frozenVerdict.status, 'within');
  assert.equal(chain.bindings.length, 1);
  assert.equal(chain.bindings[0].id, ATOMIC_BINDING_ID);

  // 覆盖记录陈旧（路径版本前进）后仍可读，且不再可用。
  const stale = writer.project;
  stale.data.paths.find(item => item.id === ATOMIC_PATH_ID).version += 1;
  assert.equal(historyEntries(stale).overrides[0].value, 75);
  const reading = bindingUsable(stale, stale.data.indicatorBindings[0]);
  assert.equal(reading.usable, false);
  assert.equal(reading.refusal, true);
  assert.match(reading.problems[0], /路径版本已变化/);
});

test('saving 75 then changing the path and advancing its version returns the new baseline and keeps 75 in history', () => {
  const { writer } = fixture();
  const saved = writer.commit(setCommand(writer));
  assert.equal(saved.status, 'published');

  // 保存之后：当前采用值就是覆盖值 75。
  const before = writer.reading({ year: 2030 });
  assert.equal(before.value, 75);
  assert.equal(before.adoptedValue, 75);
  assert.equal(before.applicable, true);
  assert.equal(before.reason, null);
  assert.equal(before.frozenBaseline, BASELINE_2030);
  assert.equal(before.pathVersion, 1);

  // 修改路径并推进版本：2026 = 50 不变、2035 由 100 改为 120，路径版本 v1 → v2。
  // 2030 新基线 = 50 + 70 * 4/9 = 730/9 ≈ 81.1111，2031 新基线 = 50 + 70 * 5/9 = 800/9。
  const revisionAfterSet = writer.revision;
  writer.mutate(project => {
    const path = project.data.paths.find(item => item.id === ATOMIC_PATH_ID);
    path.points.find(point => point.year === 2035).value = 120;
    path.version += 1;
  });

  const after = writer.reading({ year: 2030 });
  assert.equal(after.baseline, 730 / 9);
  assert.equal(after.value, 730 / 9);
  assert.equal(after.adoptedValue, null);
  assert.equal(after.applicable, false);
  assert.equal(after.frozenBaseline, BASELINE_2030);
  assert.equal(after.currentBaseline, 730 / 9);
  assert.equal(after.recordPathVersion, 1);
  assert.equal(after.pathVersion, 2);
  assert.match(after.reason, /^基线已变，待重新采用：/);
  assert.match(after.reason, /覆盖记录停留在路径 v1，当前路径为 v2/);
  assert.match(after.reason, /该年基线已从 72.2222 变为 81.1111/);
  assert.equal(after.recordPathVersion, 1);
  assert.equal(after.pathVersion, 2);
  assert.equal(after.override.operation, 'set');
  assert.equal(after.override.value, 75);

  // 历史仍能查到 75，而且写下的那条记录没被改写、也没被删掉。
  const chain = historyEntries(writer.project);
  assert.equal(chain.overrides.length, 1);
  assert.equal(chain.overrides[0].value, 75);
  assert.equal(chain.overrides[0].frozenBaseline.reading, BASELINE_2030);
  const stored = writer.project.data.annualOverrides[0];
  assert.equal(stored.id, 'c2b-override-1');
  assert.equal(stored.value, 75);
  assert.equal(stored.pathVersion, 1);
  assert.equal(stored.baseline.reading, BASELINE_2030);
  assert.equal(stored.verdict.status, 'within');

  // 2031 从未有覆盖：继续读新路径的基线，不被 2030 的旧覆盖带偏。
  // applicable 的含义是「当前采用值来自覆盖」：没有覆盖时为 false，但 reason 也是 null
  // （与「有覆盖却已失效」区分开，后者 reason 一定有说明）。
  const untouched = writer.reading({ year: 2031 });
  assert.equal(untouched.value, 800 / 9);
  assert.equal(untouched.applicable, false);
  assert.equal(untouched.reason, null);
  assert.equal(untouched.override.operation, 'baseline');

  // 这次路径修改只发布一次快照，且没有额外通知（覆盖记录没有被重写）。
  assert.equal(writer.revision, revisionAfterSet + 1);
  assert.equal(writer.publishCount, 1);
  assert.equal(writer.notifyCount, 1);

  // 只推进版本、基线读数没变：只报版本这一项，不虚报「基线已变」。
  const { writer: versionOnly } = fixture();
  versionOnly.commit(setCommand(versionOnly));
  versionOnly.mutate(project => {
    project.data.paths.find(item => item.id === ATOMIC_PATH_ID).version += 1;
  });
  const byVersion = versionOnly.reading({ year: 2030 });
  assert.equal(byVersion.applicable, false);
  assert.equal(byVersion.value, BASELINE_2030);
  assert.match(byVersion.reason, /覆盖记录停留在路径 v1，当前路径为 v2/);
  assert.doesNotMatch(byVersion.reason, /该年基线已从/);
  assert.equal(byVersion.frozenBaseline, BASELINE_2030);
  assert.equal(byVersion.currentBaseline, BASELINE_2030);

  // 同版本下基线读数被改（内容变了但版本没动）同样失效。
  const { writer: sameVersion } = fixture();
  sameVersion.commit(setCommand(sameVersion));
  sameVersion.mutate(project => {
    project.data.paths.find(item => item.id === ATOMIC_PATH_ID)
      .points.find(point => point.year === 2035).value = 120;
  });
  const byReading = sameVersion.reading({ year: 2030 });
  assert.equal(byReading.applicable, false);
  assert.equal(byReading.value, 730 / 9);
  assert.match(byReading.reason, /该年基线已从 72.2222 变为 81.1111/);
  assert.doesNotMatch(byReading.reason, /覆盖记录停留在路径/);
});

test('the binding version carried by a command is checkable and a version bump changes it', () => {
  const { writer } = fixture();
  const before = writer.bindingVersion(ATOMIC_BINDING_ID);
  assert.deepEqual(before, {
    id: ATOMIC_BINDING_ID, descriptorVersion: 1, pathVersion: 1, states: ['compat-a-1@v1', 'compat-a-2@v1']
  });
  const command = setCommand(writer);
  assert.deepEqual(command.bindingVersion, before);
  assert.equal(command.bindingId, ATOMIC_BINDING_ID);
  assert.equal(command.slotRaw, writer.slot.readRaw());
  assert.equal(command.pathVersion, 1);
  assert.equal(typeof command.snapshotDigest, 'string');

  const bumped = atomicFixtureV2();
  bumped.data.paths.find(item => item.id === ATOMIC_PATH_ID).version = 4;
  assert.deepEqual(bindingVersionOf({ ...writer.project.data.indicatorBindings[0], pathVersion: 4 }),
    { ...before, pathVersion: 4 });
});

test('a missing current binding still saves the manual parameter and marks the state pending', () => {
  const { writer } = fixture();
  const command = writer.preview({
    operation: 'set', year: 2030, pathId: ATOMIC_PATH_ID, bindingId: null, value: 75, referenceStateId: null
  });
  const result = writer.commit(command);
  assert.equal(result.status, 'published');
  assert.equal(result.record.bindingId, null);
  assert.equal(result.record.verdict.status, 'pending');
  assert.match(result.record.verdict.detail, /缺少当前采用绑定/);
  assert.deepEqual(result.record.verdict.candidateStateIds, []);
  assert.equal(writer.reading({ year: 2030 }).value, 75);

  // 区间告缺或对照状态缺失同样待核，不给数值结论。
  const noReference = describeValue({
    states: writer.project.data.states, referenceStateId: null, value: 75, unit: '示例单位', hasBinding: true
  });
  assert.equal(noReference.status, 'pending');
  assert.match(noReference.detail, /未选择对照状态/);
  const noRange = describeValue({
    states: writer.project.data.states.map(state => ({ ...state, range: null })),
    referenceStateId: 'compat-a-2', value: 75, unit: '示例单位', hasBinding: true
  });
  assert.equal(noRange.status, 'pending');
  assert.match(noRange.detail, /没有有效数值区间/);
});

test('the slot refuses a write made against stale bytes', () => {
  const project = atomicFixtureV2();
  const storage = createMemoryStorage();
  const slot = createProjectSlot(storage);
  const seeded = slot.seed(project);
  // 另一个写入者已经落盘：字节对不上时拒绝，槽位保持对方写下的内容。
  const other = { ...structuredClone(project), revision: project.revision + 1 };
  storage.setItem(ATOMIC_SLOT_KEY, JSON.stringify(other));
  const next = { ...structuredClone(project), title: '本写入者想写的内容' };
  assert.throws(() => slot.write(next, seeded), error => error instanceof AtomicError && error.code === 'SLOT_CHANGED');
  assert.equal(slot.readRaw(), JSON.stringify(other));
  // 字节一致才落盘，返回值就是落盘内容。
  const raw = slot.seed(project);
  assert.equal(slot.write(next, raw), JSON.stringify(next));
  assert.equal(slot.readRaw(), JSON.stringify(next));
  assert.equal(slot.read().project.title, '本写入者想写的内容');
  // 槽位内容不是 JSON 时不能继续。
  storage.setItem(ATOMIC_SLOT_KEY, 'not json');
  assert.throws(() => slot.read(), SyntaxError);
});

test('the prototype never touches the real project persistence key', () => {
  const { writer } = fixture();
  writer.commit(setCommand(writer));
  assert.equal(/scenario-workbench\.project\.v1/.test(ATOMIC_SLOT_KEY), false);
  assert.equal(ATOMIC_SLOT_KEY, 'scenario-workbench.project.v2.atomic');
  assert.equal(ATOMIC_SLOT_KEY.includes('scenario-workbench.project.v1'), false);
  assert.equal(typeof toSnapshotV1(writer.project).revision, 'number');
  assert.doesNotThrow(() => validateProjectV2(writer.project));
});

test('success keeps the old envelope exactly and only its currency changes', () => {
  const { writer } = fixture();
  const judgmentIds = writer.project.data.judgments.map(item => item.id);
  const oldArchive = buildArchiveV2(writer.project, { year: 2030, selectedJudgmentIds: judgmentIds }).archive;
  // 提交前：旧封套冻结的快照按完整项目快照判定为当前。
  assert.equal(isCurrent(writer.project, oldArchive.projectInputSnapshot), true);

  const before = JSON.stringify(oldArchive);
  const frozenSnapshot = JSON.stringify(oldArchive.projectInputSnapshot);
  assert.equal(writer.commit(setCommand(writer)).status, 'published');

  // 旧封套一个字节都没被重写；变的只是它的当前性。
  assert.equal(JSON.stringify(oldArchive), before);
  assert.equal(JSON.stringify(oldArchive.projectInputSnapshot), frozenSnapshot);
  assert.equal(isCurrent(writer.project, oldArchive.projectInputSnapshot), false);

  // 重新构封套是当前的；历史链照旧可读，旧封套只作为历史存在。
  const newArchive = buildArchiveV2(writer.project, { year: 2030, selectedJudgmentIds: judgmentIds }).archive;
  assert.equal(isCurrent(writer.project, newArchive.projectInputSnapshot), true);
  assert.equal(writer.history().overrides.length, 1);
  assert.equal(writer.history().overrides[0].value, 75);
});
