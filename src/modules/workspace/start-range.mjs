import { YEAR_MIN, YEAR_MAX } from './regions.mjs';

export const DEFAULT_TITLE = '未命名情景项目';
export const DEFAULT_NAME = '情景1';

// Suggest a readable name from the chosen range without ever overwriting a manual
// name: the suggestion is only written when the user asks for it.
export function suggestTitle(regionId, years) {
  const area = (regionId || '').trim();
  const first = [...(years || [])].sort((a, b) => a - b)[0];
  if (area && first) return area + '·' + first + '年情景';
  if (area) return area + '情景';
  if (first) return first + '年情景';
  return DEFAULT_NAME;
}

export function displayTitle(projectTitle) {
  return projectTitle === DEFAULT_TITLE ? DEFAULT_NAME : projectTitle;
}

export function addYears(list, values) {
  const merged = new Set(list);
  for (const value of values) merged.add(Number(value));
  return [...merged].filter(value => Number.isInteger(value) && value >= YEAR_MIN && value <= YEAR_MAX).sort((a, b) => a - b);
}

export function removeYear(list, value) {
  return list.filter(item => item !== Number(value));
}

// One shared parser for every year entry point: the selection chips and the expert
// shortcut field must accept exactly the same values and report the same reasons.
export function parseYearList(raw) {
  const text = String(raw === null || raw === undefined ? '' : raw).trim();
  const tokens = text ? text.split(/[,，、\s]+/) : [];
  if (tokens.some(token => !/^\d{4}$/.test(token))) return { ok: false, message: '年份请填写四位整数，并用逗号分隔。' };
  const years = tokens.map(Number);
  if (years.some(year => year < YEAR_MIN || year > YEAR_MAX)) return { ok: false, message: '研究年份需在 ' + YEAR_MIN + '—' + YEAR_MAX + ' 之间。' };
  if (new Set(years).size !== years.length) return { ok: false, message: '年份不重复：请去掉重复的年份。' };
  return { ok: true, years: years.sort((a, b) => a - b) };
}

export function checkYear(value) {
  const text = String(value === null || value === undefined ? '' : value).trim();
  if (!/^\d{4}$/.test(text)) return { ok: false, message: '年份请填写四位整数。' };
  const year = Number(text);
  if (year < YEAR_MIN || year > YEAR_MAX) return { ok: false, message: '研究年份需在 ' + YEAR_MIN + '—' + YEAR_MAX + ' 之间。' };
  return { ok: true, year };
}

// A blank range is allowed for exploration, but the missing part stays visible.
export function rangeGaps(regionId, years) {
  const gaps = [];
  if (!regionId) gaps.push('尚未选择研究地区');
  if (!years.length) gaps.push('尚未选择研究年份');
  return gaps;
}

export function rangeSummary(regionId, years) {
  const area = regionId || '尚未选择地区';
  const when = years.length ? [...years].sort((a, b) => a - b).join(' / ') : '尚未选择年份';
  return area + ' · ' + when;
}

export function rangePreview(start, end, step) {
  const from = checkYear(start), to = checkYear(end), gap = Number(step);
  if (!from.ok) return { ok: false, message: '起始年：' + from.message };
  if (!to.ok) return { ok: false, message: '结束年：' + to.message };
  if (!Number.isInteger(gap) || gap < 1) return { ok: false, message: '间隔请填写不小于 1 的整数年。' };
  if (to.year < from.year) return { ok: false, message: '结束年不能早于起始年。' };
  const years = [];
  for (let year = from.year; year <= to.year; year += gap) years.push(year);
  if (years.length > 40) return { ok: false, message: '一次最多预览并添加 40 个年份，请缩小范围或加大间隔。' };
  return { ok: true, years };
}
