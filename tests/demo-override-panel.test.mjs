// P7 演示路径面板（src/modules/timeline/override-ledger-panel.mjs）的专项验收。
// 无 DOM：面板本体需要 document，这里只测面板导出的纯 helper，以及透过 override-store.mjs
// 复核「写入失败之后项目 / 槽位字节 / 修订 / 通知次数 / 读数 / 历史逐项不变，同一条命令随后可成功」。
// 夹具风格与 tests/demo-override.test.mjs 保持一致：线性路径 2026 = 50 → 2035 = 100，
// scope.years = [2030, 2031, 2035]，手算基线 2030 = 650/9 ≈ 72.2222、2031 = 700/9 ≈ 77.7778。

import test from 'node:test';
import assert from 'node:assert/strict';

import { validateProject } from '../src/core/contracts.mjs';
import { interpolate } from '../src/modules/timeline/logic.mjs';
import { displayValue } from '../src/modules/timeline/annual-override.mjs';
import {
  OVERRIDE_SLOT_KEY,
  createMemoryStorage,
  createOverrideLedger
} from '../src/modules/timeline/override-store.mjs';
import {
  DECLARED_BY,
  PANEL_STORAGE_NOTE,
  failingStorage,
  ledgerStatusText,
  overrideRows
} from '../src/modules/timeline/override-ledger-panel.mjs';

const REGION = '示例地区（非真实政策）';
const PATH_ID = 'fixture-path-a';
const BASELINE_2030 = 650 / 9;
const BASELINE_2031 = 700 / 9;

function fixtureProject({ revision = 2 } = {}) {
  const base = {
    version: 1,
    provenance: { origin: 'fixture', sourceId: 'demo-override-panel-test', locator: 'tests/demo-override-panel.test.mjs' }
  };
  const project = {
    schemaVersion: 1,
    contractVersion: '1.0.0',
    id: 'demo-override-panel-fixture',
    title: '年度覆盖面板夹具（非真实政策）',
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

function setup({ storage = createMemoryStorage() } = {}) {
  const project = fixtureProject();
  const notices = [];
  const ledger = createOverrideLedger({ storage, notify: notice => notices.push(notice) });
  ledger.load(project, { origin: 'local' });
  return { project, storage, ledger, notices };
}

const setCommand = (ledger, project, extra = {}) => ledger.preview(project, {
  year: 2030, pathId: PATH_ID, value: 75, referenceStateId: 'fixture-a-2',
  declaredBy: DECLARED_BY, reason: '采用年度覆盖 75', ...extra
});

test('the fixture path is contract-valid and its hand-computed baselines match the ledger fixture', () => {
  const project = fixtureProject();
  assert.doesNotThrow(() => validateProject(project));
  const path = project.data.paths[0];
  assert.equal(interpolate(path, 2030).value, BASELINE_2030);
  assert.equal(interpolate(path, 2031).value, BASELINE_2031);
  assert.equal(displayValue(BASELINE_2030), '72.2222');
  assert.equal(displayValue(BASELINE_2031), '77.7778');
});

test('failingStorage delegates to the real storage until armed, then refuses exactly one write', () => {
  const base = createMemoryStorage();
  base.setItem('k', 'v1');
  let armed = false;
  const storage = failingStorage(base, () => armed);

  // 未武装：原样透传（读、写、删、length 都通到底层）。
  assert.equal(storage.getItem('k'), 'v1');
  storage.setItem('k', 'v2');
  assert.equal(base.getItem('k'), 'v2');
  assert.equal(storage.length, base.length);
  assert.equal(storage.spent, false);

  armed = true;
  assert.throws(() => storage.setItem('k', 'v3'), error => error.name === 'QuotaExceededError');
  // 只拒绝一次：抛错后自行解除武装，底层字节没被动过。
  assert.equal(storage.spent, true);
  assert.equal(base.getItem('k'), 'v2');
  assert.equal(base.writes, 2);

  storage.setItem('k', 'v4');
  assert.equal(base.getItem('k'), 'v4');
  assert.equal(base.writes, 3);

  // rearm 之后可以再演示一次；removeItem 也照旧透传。
  storage.rearm();
  armed = true;
  assert.throws(() => storage.setItem('k', 'v5'), error => error.name === 'QuotaExceededError');
  storage.removeItem('k');
  assert.equal(base.getItem('k'), null);

  // 底层不合格就直接拒绝，不做半吊子适配。
  assert.throws(() => failingStorage(null, () => true), TypeError);
  assert.throws(() => failingStorage({ getItem: () => null }, () => true), TypeError);
});

test('a refused write through the panel adapter leaves project, slot, revision, notices and reading untouched', () => {
  const { project, storage, ledger, notices } = setup();
  const before = {
    raw: storage.getItem(OVERRIDE_SLOT_KEY),
    revision: project.revision,
    reading: ledger.reading(project, { year: 2030, pathId: PATH_ID })
  };
  const frozen = JSON.stringify(project);
  const command = setCommand(ledger, project);

  storage.setFail(true);
  const rejected = ledger.commit(project, command);
  assert.equal(rejected.status, 'refused');
  assert.equal(rejected.code, 'WRITE_REJECTED');
  assert.match(rejected.message, /未发布/);

  // 面板的拒绝文案要以「未改变」为前提：逐项与提交前比对。
  assert.equal(storage.getItem(OVERRIDE_SLOT_KEY), before.raw);
  assert.equal(ledger.slotRaw(), before.raw);
  assert.equal(project.revision, before.revision);
  assert.equal(JSON.stringify(project), frozen);        // 项目对象一个字节都没改
  assert.equal(ledger.publishCount(), 0);
  assert.equal(ledger.notifyCount(), 0);
  assert.equal(notices.length, 0);
  assert.equal(ledger.history(project, { year: 2030, pathId: PATH_ID }).length, 0);
  assert.deepEqual(ledger.reading(project, { year: 2030, pathId: PATH_ID }), before.reading);
  assert.equal(storage.writes, 1);                      // 失败发生在落盘之前，写入尝试本身计数

  // 同一条命令随后成功：编号不跳号，通知恰好一次。
  storage.setFail(false);
  const retried = ledger.commit(project, command);
  assert.equal(retried.status, 'published');
  assert.equal(retried.record.id, 'override-1');
  assert.equal(ledger.publishCount(), 1);
  assert.equal(ledger.notifyCount(), 1);
  assert.equal(notices.length, 1);
  assert.equal(ledger.reading(project, { year: 2030, pathId: PATH_ID }).value, 75);
  assert.equal(project.revision, before.revision);      // 项目仍然没被改过
});

test('ledgerStatusText names the source, distinguishes an adopted 0 from no adoption, and repeats the stale reason', () => {
  // 没有采用：读基线，且明确说没有记录（不把「无」写成 0）。
  const empty = ledgerStatusText({
    value: BASELINE_2030, adopted: false, adoptedValue: null, baseline: BASELINE_2030,
    reason: null, operation: 'baseline', recordId: null, historyCount: 0
  });
  assert.match(empty, /^当前读数：72\.2222；来源：基线/);
  assert.match(empty, /该年没有年度覆盖记录/);
  assert.doesNotMatch(empty, /当前采用值：0/);

  // 采用 0：0 是真的被采用，来源写「年度覆盖」并点名记录。
  const zero = ledgerStatusText({
    value: 0, adopted: true, adoptedValue: 0, baseline: BASELINE_2030,
    reason: null, operation: 'set', recordId: 'override-2', historyCount: 2
  });
  assert.match(zero, /^当前读数：0；来源：年度覆盖/);
  assert.match(zero, /override-2/);

  // 覆盖失效：来源回到基线，并且原样带上台账给出的「基线已变，待重新采用」理由。
  const stale = ledgerStatusText({
    value: BASELINE_2030, adopted: false, adoptedValue: null, baseline: BASELINE_2030,
    reason: '基线已变，待重新采用：覆盖记录停留在路径 v1，当前路径为 v2。',
    operation: 'set', recordId: 'override-1', historyCount: 1
  });
  assert.match(stale, /来源：基线/);
  assert.match(stale, /基线已变，待重新采用/);

  // 最近一次是撤销：与「从来没有覆盖」用词不同。
  const revoked = ledgerStatusText({
    value: BASELINE_2031, adopted: false, adoptedValue: null, baseline: BASELINE_2031,
    reason: null, operation: 'revoke', recordId: 'override-3', historyCount: 3
  });
  assert.match(revoked, /最近一次记录是撤销年度覆盖/);

  // 缺值不编造：缺失就写缺失。
  assert.match(ledgerStatusText({ value: null, adopted: false, reason: null, operation: 'baseline' }), /缺失/);
  assert.match(ledgerStatusText(null), /尚未选择年份与路径/);
});

test('overrideRows marks the latest record that is no longer current as 基线已变，待重新采用 and keeps its old value readable', () => {
  // 路径推进到 v2、基线也变：历史那条记录本身没有被改写，旧值 75 仍可读。
  const { project, ledger } = setup();
  assert.equal(ledger.commit(project, setCommand(ledger, project)).status, 'published');
  const advanced = fixtureProject({ revision: project.revision + 1 });
  advanced.data.paths[0].points.find(point => point.year === 2035).value = 120;
  advanced.data.paths[0].version += 1;

  const reading = ledger.reading(advanced, { year: 2030, pathId: PATH_ID });
  const history = ledger.history(advanced, { year: 2030, pathId: PATH_ID });
  const rows = overrideRows(history, reading);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'override-1');
  assert.equal(rows[0].latest, true);
  assert.equal(rows[0].current, false);
  assert.equal(rows[0].stale, true);
  assert.equal(rows[0].statusText, '基线已变，待重新采用');
  assert.equal(rows[0].valueText, '75');            // 旧值仍然读得出来
  assert.equal(rows[0].rawValue, 75);
  assert.equal(rows[0].pathVersionText, 'v1');      // 记录停留在写它时的路径版本
  assert.equal(rows[0].baselineText, '72.2222');    // 冻结基线也照旧可读
  assert.match(rows[0].staleNote, /^基线已变，待重新采用：/);

  // 当前采用：状态改口为「当前采用」。
  const adoptedRows = overrideRows(ledger.history(project, { year: 2030, pathId: PATH_ID }),
    ledger.reading(project, { year: 2030, pathId: PATH_ID }));
  assert.equal(adoptedRows[0].current, true);
  assert.equal(adoptedRows[0].stale, false);
  assert.equal(adoptedRows[0].statusText, '当前采用（来源：年度覆盖）');

  // 撤销之后：最新一条是撤销，前一条降级为历史，两条都还在，谁也不被删除。
  assert.equal(ledger.revoke(project, { year: 2030, pathId: PATH_ID, declaredBy: DECLARED_BY, reason: '撤销年度覆盖' }).status, 'published');
  const afterRevoke = overrideRows(ledger.history(project, { year: 2030, pathId: PATH_ID }),
    ledger.reading(project, { year: 2030, pathId: PATH_ID }));
  assert.equal(afterRevoke.length, 2);
  assert.equal(afterRevoke[0].current, false);
  assert.equal(afterRevoke[0].stale, false);
  assert.equal(afterRevoke[0].statusText, '历史记录（已被后续记录取代）');
  assert.equal(afterRevoke[0].valueText, '75');
  assert.equal(afterRevoke[1].latest, true);
  assert.equal(afterRevoke[1].operation, 'revoke');
  assert.equal(afterRevoke[1].valueText, null);
  assert.equal(afterRevoke[1].statusText, '撤销记录（回到基线）');

  // 空历史与异常入参都不抛错。
  assert.deepEqual(overrideRows([], null), []);
  assert.deepEqual(overrideRows(undefined, undefined), []);
});

test('the panel storage note states the separate slot, the single-writer limit and the 0-versus-blank rule', () => {
  assert.match(PANEL_STORAGE_NOTE, /与项目分开的独立存储槽位/);
  assert.match(PANEL_STORAGE_NOTE, /项目对象一个字节都不改/);
  assert.match(PANEL_STORAGE_NOTE, /单写入者/);
  assert.match(PANEL_STORAGE_NOTE, /跨标签页或跨窗口同时写入没有被设计、没有被验证/);
  assert.match(PANEL_STORAGE_NOTE, /填 0 是有效取值/);
  assert.match(PANEL_STORAGE_NOTE, /留空表示撤销/);
  assert.equal(DECLARED_BY, '本地使用者');
});
