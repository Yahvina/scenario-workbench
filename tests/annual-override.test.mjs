import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {interpolate} from '../src/modules/timeline/logic.mjs';
import {
  classifyOverride, createOverridePreview, overrideKey, displayValue, matchesRange,
  boundaryReason, bindingGaps, rangeEdges, VERDICT_TEXT, OVERRIDE_NO_STATE, OVERRIDE_PENDING_BINDING,
  OVERRIDE_UNVERIFIED_BINDING, hasCarriedBinding, bindingNoteFor
} from '../src/modules/timeline/annual-override.mjs';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
// P7-C1：正式源码里不允许再出现任何夹具通道名（旧的全局开关名与新的独立入口槽名都不行）。
const FIXTURE_CHANNEL_NAMES = ['__scenarioWorkbenchReviewBindingFixture', '__scenarioWorkbenchReviewBindingFixtureNow'];

async function productionSources(dir) {
  const found = [];
  for (const entry of await readdir(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await productionSources(full));
    else if (entry.name.endsWith('.mjs')) found.push(full);
  }
  return found;
}

// 机制示例绑定（明确标注：这是夹具口径，不是真实政策指标）。
const BINDING = {
  verified: true, purpose: '机制示例：单年采用值核对', region: '示例地区（非真实政策）',
  year: 2030, indicator: '示例占比', unit: '%', denominator: '示例分母', baseYear: 2025
};

// 规则文档手算基准：低 [0,60)、中 [60,80)、高 [80,100]。
const STATES = [
  {id: 's-low', label: '低', range: {min: 0, max: 60, minInclusive: true, maxInclusive: false}, unit: '%'},
  {id: 's-mid', label: '中', range: {min: 60, max: 80, minInclusive: true, maxInclusive: false}, unit: '%'},
  {id: 's-high', label: '高', range: {min: 80, max: 100, minInclusive: true, maxInclusive: true}, unit: '%'}
];

// 路径 2026 = 50、2035 = 100 线性；2030 基线 = 650/9，2031 = 700/9。
const PATH = {
  id: 'path-hand', version: 1, unit: '%', regionId: '示例地区（非真实政策）', interpolation: 'linear',
  points: [
    {year: 2026, value: 50, stateId: null, origin: 'anchor', evidenceRefs: []},
    {year: 2035, value: 100, stateId: null, origin: 'anchor', evidenceRefs: []}
  ]
};

const baselineOf = year => interpolate(PATH, year).value;
const mid = id => ({referenceStateId: id ?? 's-mid', states: STATES, binding: BINDING});

test('the hand-computed baselines match the rules document', () => {
  assert.equal(baselineOf(2030), 650 / 9);
  assert.equal(baselineOf(2031), 700 / 9);
  assert.equal(displayValue(baselineOf(2030)), '72.2222');
  assert.equal(displayValue(baselineOf(2031)), '77.7778');
});

test('75 stays inside the original state and keeps the neighbouring year on its own baseline', () => {
  const r = classifyOverride({...mid(), baseline: baselineOf(2030), override: 75});
  assert.equal(r.verdict, 'within');
  assert.equal(VERDICT_TEXT[r.verdict], '仍在原状态范围');
  assert.equal(r.reference.label, '中');
  assert.match(r.reasons[0], /仍在原状态「中」的区间 \[60, 80\) % 内/);
  assert.match(r.reasons[1], /不自动改分/);
  // 覆盖只作用于 2030：2031 的基线由路径自身算出，没有任何覆盖参与。
  assert.equal(baselineOf(2031), 700 / 9);
  assert.equal(classifyOverride({...mid(), baseline: baselineOf(2031), override: null}).value, 700 / 9);
});

test('80 is out of range and only then is the single candidate offered', () => {
  const r = classifyOverride({...mid(), baseline: baselineOf(2030), override: 80});
  assert.equal(r.verdict, 'out-of-range');
  assert.match(r.reasons[0], /越出上界 80（不含上界）/);
  assert.deepEqual(r.candidates.map(c => c.label), ['高']);
  assert.match(r.reasons[2], /建议复核为「高」；仅供核对，需你确认。/);
});

test('79.9999 still belongs to the middle state and keeps its own precision', () => {
  const r = classifyOverride({...mid(), baseline: baselineOf(2030), override: 79.9999});
  assert.equal(r.verdict, 'within');
  assert.equal(r.reference.label, '中');
  assert.equal(displayValue(79.9999), '79.9999');
  // 显示用的四舍五入不参与判档：79.9999 与 80 必须得出不同结论。
  assert.notEqual(r.verdict, classifyOverride({...mid(), baseline: baselineOf(2030), override: 80}).verdict);
});

test('0 is a valid value and clearing is a different reading', () => {
  const zero = classifyOverride({...mid(), baseline: baselineOf(2030), override: 0});
  assert.equal(zero.verdict, 'out-of-range');
  assert.deepEqual(zero.candidates.map(c => c.label), ['低']);
  assert.equal(zero.override, 0);
  const cleared = classifyOverride({...mid(), baseline: baselineOf(2030), override: null});
  assert.equal(cleared.verdict, 'baseline');
  assert.equal(cleared.cleared, true);
  assert.equal(cleared.override, null);
  assert.equal(cleared.value, baselineOf(2030));
  assert.match(cleared.reasons[0], /覆盖已清空：回到该年基线 72.2222/);
  assert.notDeepEqual(zero.verdict, cleared.verdict);
});

test('80 is compared at save precision, not after rounding', () => {
  assert.equal(matchesRange({min: 60, max: 80, minInclusive: true, maxInclusive: false}, 79.9999), true);
  assert.equal(matchesRange({min: 60, max: 80, minInclusive: true, maxInclusive: false}, 80), false);
  assert.equal(matchesRange({min: 60, max: 80, minInclusive: true, maxInclusive: false}, 60), true);
  assert.equal(matchesRange({min: 60, max: 80, minInclusive: false, maxInclusive: false}, 60), false);
  assert.equal(matchesRange({min: 60, max: 80, minInclusive: false, maxInclusive: true}, 80), true);
  // 单侧无界不检查该侧。
  assert.equal(matchesRange({max: 60, maxInclusive: false}, -1000), true);
  assert.equal(matchesRange({min: 0, minInclusive: true}, 1e9), true);
  assert.equal(boundaryReason({max: 80, maxInclusive: false}, 80), '越出上界 80（不含上界）');
  assert.equal(rangeEdges({min: null, max: null}), null);
});

test('overlapping states are reported as ambiguous, never as the first match', () => {
  const overlap = STATES.map(s => s.id === 's-high' ? {...s, range: {min: 79, max: 100, minInclusive: true, maxInclusive: true}} : s);
  const r = classifyOverride({...mid(), states: overlap, baseline: baselineOf(2030), override: 79.5});
  assert.equal(r.verdict, 'multiple');
  assert.deepEqual(r.candidates.map(c => c.label).sort(), ['中', '高'].sort());
  assert.match(r.reasons[1], /不按排序取第一档/);
});

test('a value outside every defined state is a gap, not a suggestion', () => {
  const highFrom82 = STATES.map(s => s.id === 's-high' ? {...s, range: {min: 82, max: 100, minInclusive: true, maxInclusive: true}} : s);
  const r = classifyOverride({...mid(), states: highFrom82, baseline: baselineOf(2030), override: 81});
  assert.equal(r.verdict, 'gap');
  assert.equal(r.candidates.length, 0);
  assert.match(r.reasons[2], /未落入已定义状态/);
});

test('unknown ranges, unit mismatch, qualitative and multi-parameter states all fall to pending', () => {
  const noRange = STATES.map(s => s.id === 's-mid' ? {...s, range: null} : s);
  const unknown = classifyOverride({...mid(), states: noRange, baseline: baselineOf(2030), override: 75});
  assert.equal(unknown.verdict, 'pending');
  assert.match(unknown.reasons.join(''), /没有有效数值区间/);

  const wrongUnit = STATES.map(s => s.id === 's-mid' ? {...s, unit: '万千瓦'} : s);
  const unit = classifyOverride({...mid(), states: wrongUnit, baseline: baselineOf(2030), override: 75});
  assert.equal(unit.verdict, 'pending');
  assert.match(unit.reasons.join(''), /单位不一致/);

  assert.equal(classifyOverride({...mid(), baseline: baselineOf(2030), override: 75, qualitative: true}).verdict, 'pending');
  assert.equal(classifyOverride({...mid(), baseline: baselineOf(2030), override: 75, multiParameter: true}).verdict, 'pending');
  // 多参数待核不改变原状态，也不越界给出建议。
  const multi = classifyOverride({...mid(), baseline: baselineOf(2030), override: 95, multiParameter: true});
  assert.equal(multi.verdict, 'pending');
  assert.equal(multi.candidates.length, 0);
});

test('a production project without an explicit binding is pending, with the known out-of-range kept', () => {
  const pending = classifyOverride({...mid(), binding: null, baseline: baselineOf(2030), override: 999});
  assert.equal(pending.verdict, 'pending');
  assert.deepEqual(pending.reasons, [OVERRIDE_PENDING_BINDING]);
  assert.equal(pending.knownOutOfRange, true);
  assert.equal(bindingGaps({verified: false}).length, 1);
  assert.match(bindingGaps({verified: true, purpose: 'x'}).join(''), /绑定缺少地区/);
  assert.equal(bindingGaps(BINDING).length, 0);
});

test('a binding carried by persisted project data is never usable to the production code', () => {
  const path = {id: 'path-a', version: 1, reviewBinding: {...BINDING}};
  // 正式路径：模块只回答「字段在不在」，不把内容交给任何计算通路，也没有开关能打开它。
  assert.equal(hasCarriedBinding(path), true);
  assert.equal(hasCarriedBinding({id: 'path-b', version: 1}), false);
  assert.equal(bindingNoteFor(path), OVERRIDE_UNVERIFIED_BINDING);
  assert.equal(bindingNoteFor({id: 'path-b', version: 1}), OVERRIDE_PENDING_BINDING);

  // 正式渲染传进来的一定是 binding = null（调用方不提供供应槽），所以只可能停在待核。
  const carried = classifyOverride({
    ...mid(), binding: null, missingBindingNote: bindingNoteFor(path),
    baseline: baselineOf(2030), override: 80
  });
  assert.equal(carried.verdict, 'pending', 'a carried binding must stay pending');
  assert.deepEqual(carried.reasons, [OVERRIDE_UNVERIFIED_BINDING]);
  assert.equal(carried.candidates.length, 0, 'no candidate state may be offered');
  assert.doesNotMatch(carried.reasons.join(''), /建议复核为/);

  assert.equal(bindingGaps({verified: false})[0], OVERRIDE_UNVERIFIED_BINDING);
});

test('the production source tree carries no fixture channel at all', async () => {
  // P7-C1 的核心保证：夹具通道整段只存在于测试树。生产源码里既没有旧的全局开关，
  // 也没有任何以「读取夹具绑定」为目的的全局名。这条断言比单点开关更耐久：
  // 以后无论谁把通道塞回 src/，这里都会红。
  const files = await productionSources(path.join(repoRoot, 'src'));
  assert.ok(files.length > 20, 'sanity: the source tree must actually be scanned');
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const name of FIXTURE_CHANNEL_NAMES) {
      assert.equal(source.includes(name), false,
        path.relative(repoRoot, file).replaceAll('\\', '/') + ' must not mention ' + name);
    }
  }
  // 正式入口仍然只挂 src/app.mjs（三个既有守卫脚本把它当作 bundle 启动行）。
  const html = await readFile(path.join(repoRoot, 'index.html'), 'utf8');
  assert.match(html, /<script type="module" src="\.\/src\/app\.mjs"><\/script>/);
  assert.doesNotMatch(html, /tests\/entry/);
});

test('no reference state asks the user to choose one instead of borrowing a neighbour', () => {
  const r = classifyOverride({...mid(), referenceStateId: null, baseline: baselineOf(2030), override: 75});
  assert.equal(r.verdict, 'pending');
  assert.ok(r.reasons.includes(OVERRIDE_NO_STATE));
  assert.match(OVERRIDE_NO_STATE, /不从邻年复制/);
});

test('a missing baseline stays missing and is not written as zero', () => {
  const r = classifyOverride({...mid(), baseline: null, override: 75});
  assert.equal(r.baseline, null);
  assert.equal(r.override, 75);
  const cleared = classifyOverride({...mid(), baseline: null, override: ''});
  assert.equal(cleared.verdict, 'pending');
  assert.match(cleared.reasons[0], /该年没有基线值/);
});

test('a binding that belongs to another year or region is pending, not reused', () => {
  const other = classifyOverride({...mid(), baseline: baselineOf(2030), override: 75, year: 2031, region: BINDING.region});
  assert.equal(other.verdict, 'pending');
  assert.match(other.reasons.join(''), /绑定年份（2030）与查看年份（2031）不一致/);
  assert.equal(other.candidates.length, 0);
  const wrongRegion = classifyOverride({...mid(), baseline: baselineOf(2030), override: 75, year: 2030, region: '另一个地区'});
  assert.equal(wrongRegion.verdict, 'pending');
  assert.match(wrongRegion.reasons.join(''), /绑定地区（示例地区（非真实政策））与项目范围（另一个地区）不一致/);
  // 对得上时不额外进入待核。
  assert.equal(classifyOverride({...mid(), baseline: baselineOf(2030), override: 75, year: 2030, region: BINDING.region}).verdict, 'within');
});

test('the chosen reference state is scoped to its own year as well', () => {
  const preview = createOverridePreview({projectId: 'p1', regionId: 'r1'});
  const t = {pathId: 'path-hand', pathVersion: 1};
  preview.setReference(2030, t, 's-high');
  assert.equal(preview.getReference(2030, t), 's-high');
  assert.equal(preview.getReference(2031, t), null, 'the 2031 view must not inherit the 2030 choice');
  preview.setReference(2031, t, 's-low');
  assert.equal(preview.getReference(2030, t), 's-high');
  assert.equal(preview.getReference(2031, t), 's-low');
  assert.equal(preview.referenceSize(), 2);
  preview.setReference(2030, t, '');
  assert.equal(preview.getReference(2030, t), null);
  // 换项目即整组失效，必须重新确认。
  assert.equal(preview.retarget({projectId: 'p2'}), true);
  assert.equal(preview.referenceSize(), 0);
});

test('the preview is scoped by project, region, path and version, and never leaks across years', () => {
  const preview = createOverridePreview({projectId: 'p1', regionId: 'r1'});
  const one = {pathId: 'path-a', pathVersion: 1}, two = {pathId: 'path-b', pathVersion: 1};
  preview.set(2030, one, 75);
  assert.equal(preview.get(2030, one), 75);
  assert.equal(preview.get(2031, one), null, '2031 must not inherit the 2030 value');
  preview.set(2031, one, 80);
  assert.equal(preview.get(2030, one), 75);
  assert.equal(preview.get(2031, one), 80);
  assert.equal(preview.size(), 2);
  preview.clear(2030, one);
  assert.equal(preview.get(2030, one), null);
  assert.equal(preview.get(2031, one), 80);
  // 同一年清空与填 0 是两条不同的记录。
  preview.set(2030, one, 0);
  assert.equal(preview.get(2030, one), 0);
  preview.set(2030, one, '');
  assert.equal(preview.get(2030, one), null);
  // 两条路径同年并存，互不覆盖。
  preview.set(2030, one, 75);
  preview.set(2030, two, 65);
  assert.equal(preview.get(2030, one), 75);
  assert.equal(preview.get(2030, two), 65);
  // 路径版本变化后旧键再也读不回来（视同失效，必须重新确认）。
  assert.equal(preview.get(2030, {pathId: 'path-a', pathVersion: 2}), null);
  // 换项目整组失效。
  assert.equal(preview.retarget({projectId: 'p2'}), true);
  assert.equal(preview.size(), 0);
  assert.equal(preview.retarget({regionId: 'r2'}), true);
  assert.match(overrideKey({projectId: 'p1', year: 2030}), /^p1\u0000/);
});
