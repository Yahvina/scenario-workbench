import test from 'node:test';
import assert from 'node:assert/strict';
import { decorate, filterRows, summarize, groupCounts, datasetSummary, normalize } from '../src/modules/policy/logic.mjs';

const row = (over = {}) => {
  const base = ['ID1', '路径甲', '工具甲', '北京市', '直辖市级', 2020, null, '经济工具', '补贴', 'PARENT', '确认存在', '文件甲'];
  return { ...base, ...over };
};
const toRow = obj => { const a = ['ID1', '路径甲', '工具甲', '北京市', '直辖市级', 2020, null, '经济工具', '补贴', 'PARENT', '确认存在', '文件甲']; for (const [k, v] of Object.entries(obj)) a[Number(k)] = v; return a; };

test('装饰：未知年份保持 null，不写成 0，也不向前填充', () => {
  const item = decorate(toRow({ 5: null, 6: null }));
  assert.equal(item.startYear, null);
  assert.equal(item.endYear, null);
  assert.equal(item.province, '北京市');
});

test('装饰：只有 PATH_LINKS 里明确的路径才算关联，其余是待匹配', () => {
  const linked = decorate(toRow({ 1: '单位产品能源消耗限额' }));
  assert.ok(linked.link, '已知路径应有链接');
  assert.equal(linked.link.level, 'direct');
  assert.deepEqual(linked.link.ids, ['d46-10']);
  const pending = decorate(toRow({ 1: '某个还没建立关联的路径' }));
  assert.equal(pending.link, null, '未收录路径不得硬分配');
});

test('筛选：省份/类别/层级/关联/关键词同时生效', () => {
  const items = [
    decorate(toRow({ 0: 'A', 1: '单位产品能源消耗限额', 3: '北京市', 7: '经济工具', 4: '直辖市级' })),
    decorate(toRow({ 0: 'B', 3: '天津市', 7: '规制工具', 4: '省级' })),
    decorate(toRow({ 0: 'C', 3: '中国', 4: '国家级', 7: '经济工具' }))
  ];
  assert.equal(filterRows(items, { province: '北京市' }).length, 1);
  assert.equal(filterRows(items, { province: '国家' }).length, 1);
  assert.equal(filterRows(items, { category: '经济工具' }).length, 2);
  assert.equal(filterRows(items, { level: '省级' }).length, 1);
  assert.equal(filterRows(items, { link: 'linked' }).length, 1);
  assert.equal(filterRows(items, { link: 'pending' }).length, 2);
  assert.equal(filterRows(items, { query: '天津市' }).length, 1);
});

test('汇总：缺生效年单独计数，不混进年份区间', () => {
  const items = [decorate(toRow({ 5: 2010 })), decorate(toRow({ 0: 'X', 5: null })), decorate(toRow({ 0: 'Y', 5: 2024 }))];
  const s = summarize(items);
  assert.equal(s.total, 3);
  assert.equal(s.unknownYear, 1);
  assert.equal(s.earliest, 2010);
  assert.equal(s.latest, 2024);
});

test('关键词忽略大小写和空白', () => {
  assert.equal(normalize('  Ab C '), 'abc');
  const items = [decorate(toRow({ 2: 'Clean Air Act' }))];
  assert.equal(filterRows(items, { query: 'cleanair' }).length, 1);
  assert.equal(filterRows(items, { query: 'CLEAN  AIR' }).length, 1);
});

test('整库数据能读出来，计数与同学提供的行数一致', () => {
  const { items, summary, source } = datasetSummary();
  assert.equal(items.length, 642, '不能丢行');
  assert.equal(source.rows, 642);
  assert.equal(summary.total, 642);
  assert.ok(summary.jurisdictions > 40, '管辖地数量应来自真实数据');
});

