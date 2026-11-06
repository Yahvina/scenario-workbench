import test from 'node:test';
import assert from 'node:assert/strict';
import {REGION_CATALOG,REGION_SCALES,SCALE_IDS,PROVINCES,REGIONS,TARGET_YEARS,YEAR_MIN,YEAR_MAX,optionsForScale,citiesFor,provinceForRegion,scaleForRegion,scaleLabel} from '../src/modules/workspace/regions.mjs';
import {newScenarioProject} from '../src/modules/workspace/new-project.mjs';
import {validateProject, DATA_KEYS, SELECTION_KEYS, CONTRACT_VERSION} from '../src/core/contracts.mjs';

import {DEFAULT_NAME,DEFAULT_TITLE,addYears,checkYear,displayTitle,parseYearList,rangeGaps,rangePreview,rangeSummary,removeYear,suggestTitle} from '../src/modules/workspace/start-range.mjs';

test('start page region catalog declares its source, date and incomplete coverage', () => {
  assert.match(REGION_CATALOG.source, /GB\/T 2260|行政区划/);
  assert.equal(REGION_CATALOG.checkedAt, '2026-11-04');
  assert.equal(REGION_CATALOG.onlineVerified, false, 'this round is offline; the page must say so');
  assert.match(REGION_CATALOG.scopeNote, /不是全国完整清单/);
  assert.match(REGION_CATALOG.scopeNote, /不预置任何园区/);
  assert.deepEqual(REGIONS, ['京津冀']);
  assert.deepEqual(PROVINCES, ['北京市', '天津市', '河北省']);
});

test('region scales cover region/province/city/custom and never pre-place a park', () => {
  assert.deepEqual(SCALE_IDS, ['region', 'province', 'city', 'custom']);
  for (const id of SCALE_IDS) assert.ok(scaleLabel(id).length > 0);
  const custom = REGION_SCALES.find(item => item.id === 'custom');
  assert.match(custom.hint, /不自动/);
  assert.deepEqual(optionsForScale('region'), ['京津冀']);
  assert.deepEqual(optionsForScale('province'), PROVINCES);
  assert.ok(optionsForScale('city', '北京市').length === 16);
  assert.ok(optionsForScale('city', '天津市').length === 16);
  assert.ok(optionsForScale('city', '河北省').length === 11);
  // A city must belong to the selected province, never to another one.
  assert.ok(optionsForScale('city', '河北省').includes('石家庄市'));
  assert.ok(!optionsForScale('city', '河北省').includes('海淀区'));
  assert.deepEqual(citiesFor('北京市'), optionsForScale('city', '北京市'));
});

test('a stored region maps to the scale that can express it, unknown values stay custom', () => {
  assert.equal(scaleForRegion(null), 'region');
  assert.equal(scaleForRegion(''), 'region');
  assert.equal(scaleForRegion('京津冀'), 'region');
  assert.equal(scaleForRegion('河北省'), 'province');
  assert.equal(scaleForRegion('天津市'), 'province');
  assert.equal(scaleForRegion('石家庄市'), 'city');
  assert.equal(scaleForRegion('秦皇岛市'), 'city');
  // Legacy/demo values the offline list cannot express must not be coerced.
  assert.equal(scaleForRegion('示例地区（非真实政策）'), 'custom');
  assert.equal(scaleForRegion('园区自定义地区'), 'custom');
  assert.equal(provinceForRegion('石家庄市'), '河北省');
  assert.equal(provinceForRegion('海淀区'), '北京市');
  assert.equal(provinceForRegion('示例地区（非真实政策）'), null);
});

test('the default name is suggested, never forced, and an edited name is not overwritten', () => {
  assert.equal(DEFAULT_TITLE, '未命名情景项目');
  assert.equal(DEFAULT_NAME, '情景1');
  assert.equal(displayTitle(DEFAULT_TITLE), '情景1');
  assert.equal(displayTitle('我的低碳方案'), '我的低碳方案');
  assert.equal(suggestTitle('京津冀', [2030, 2026, 2035]), '京津冀·2026年情景');
  assert.equal(suggestTitle('京津冀', []), '京津冀情景');
  assert.equal(suggestTitle('', [2030]), '2030年情景');
  assert.equal(suggestTitle('', []), '情景1');
});

test('year selection is bounded to 1900—2300, deduplicated and never silently extended', () => {
  assert.equal(YEAR_MIN, 1900);
  assert.equal(YEAR_MAX, 2300);
  assert.ok(TARGET_YEARS.includes(2020) && TARGET_YEARS.includes(2060) && TARGET_YEARS.length === 41);
  assert.deepEqual(addYears([2030], [2026, 2030]), [2026, 2030]);
  assert.deepEqual(removeYear([2026, 2030], 2026), [2030]);
  assert.deepEqual(checkYear('2030'), {ok: true, year: 2030});
  assert.equal(checkYear('1899').ok, false);
  assert.equal(checkYear('2301').ok, false);
  assert.equal(checkYear('30').ok, false);
  assert.equal(checkYear('abcd').ok, false);
  assert.match(checkYear('1899').message, /1900—2300/);
});

test('text year input reports four-digit, range and duplicate faults with actionable text', () => {
  assert.deepEqual(parseYearList('2026, 2030, 2035'), {ok: true, years: [2026, 2030, 2035]});
  assert.deepEqual(parseYearList(''), {ok: true, years: []});
  assert.equal(parseYearList('20x6').ok, false);
  assert.match(parseYearList('20x6').message, /四位整数/);
  assert.match(parseYearList('1800').message, /1900—2300/);
  assert.match(parseYearList('2030, 2030').message, /不重复/);
});

test('a start/end/step preview adds only in-range years and refuses oversized ranges', () => {
  assert.deepEqual(rangePreview('2025', '2035', '5'), {ok: true, years: [2025, 2030, 2035]});
  assert.deepEqual(rangePreview('2026', '2026', '1'), {ok: true, years: [2026]});
  assert.equal(rangePreview('2035', '2025', '5').ok, false);
  assert.equal(rangePreview('1800', '1900', '10').ok, false);
  assert.equal(rangePreview('1900', '2300', '1').ok, false, 'a 401-year range must not be added in one step');
  assert.equal(rangePreview('2020', '2030', '0').ok, false);
});

test('range summaries name the missing pieces instead of pretending the scope is supported', () => {
  assert.match(rangeSummary('', []), /尚未选择地区/);
  assert.match(rangeSummary('', []), /尚未选择年份/);
  assert.equal(rangeSummary('京津冀', [2030]), '京津冀 · 2030');
  assert.deepEqual(rangeGaps('京津冀', [2030]), []);
  assert.equal(rangeGaps('', [2030]).length, 1);
  assert.equal(rangeGaps('', []).length, 2);
  assert.equal(rangeGaps('京津冀', []).length, 1);
});

test('a drafted new scenario is a contract-valid project with a new id and no factors, scores or selections', () => {
  const fresh = newScenarioProject({id: 'fresh-id', title: '情景1', scope: {regionId: '京津冀', years: [2030]}});
  assert.notEqual(fresh.id, 'flow-existing');
  assert.equal(fresh.title, '情景1');
  assert.equal(fresh.contractVersion, CONTRACT_VERSION);
  assert.equal(fresh.revision, 0);
  assert.deepEqual(fresh.scope, {regionId: '京津冀', years: [2030]});
  assert.deepEqual(fresh.view, {perspective: 'public', module: 'workspace', objectId: null});
  for (const key of DATA_KEYS) assert.deepEqual(fresh.data[key], [], key + ' must start empty');
  for (const key of SELECTION_KEYS) assert.deepEqual(fresh.selection[key], [], key + ' must start empty');
  assert.equal(validateProject(fresh), true, 'the drafted project must pass the frozen contract');
  assert.throws(() => validateProject({...fresh, id: ''}), /项目标识、名称或修订号无效/, 'the factory output is a contract value, not a vacuous pass');
});

test('a drafted new scenario keeps the current perspective and copies scope without aliasing it', () => {
  const scope = {regionId: '京津冀', years: [2030, 2035]};
  const expert = newScenarioProject({id: 'x', title: '情景1', scope, perspective: 'expert'});
  assert.equal(expert.view.perspective, 'expert');
  assert.equal(newScenarioProject({id: 'x', title: '情景1', scope: {}, perspective: 'nonsense'}).view.perspective, 'public');
  const copied = newScenarioProject({id: 'x', title: '情景1', scope});
  copied.scope.years.push(2040);
  assert.deepEqual(scope.years, [2030, 2035], 'the draft must not alias the scope it was handed');
  assert.deepEqual(newScenarioProject({id: 'x', title: '情景1', scope: {}}).scope, {regionId: null, years: []});
});
