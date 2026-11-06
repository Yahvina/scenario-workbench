// P7 演示路径：年度覆盖台账面板（会真的写入独立槽位）。
//
// 与 annual-override-panel.mjs 的区别：那个是只读预览，值只活在内存里；这个驱动
// override-store.mjs 的原子台账，写入的是与项目分开的槽位。项目对象一个字节都不改：
// 台账自己按项目 ID 占一个槽名，项目契约（DATA_KEYS）里没有任何覆盖字段。
//
// 面板必须挂在 .timeline-editor 之外（见 index.mjs 的 publish）：编辑区的保存会用
// right.querySelectorAll('input') 检查 badInput，把这里的输入框留在编辑区里会误拦路径保存。
//
// 本文件导出三个纯 helper 供无 DOM 测试使用：failingStorage / ledgerStatusText / overrideRows。

import { el } from '../../core/ui.mjs';
import { createOverrideLedger } from './override-store.mjs';
import { displayValue } from './annual-override.mjs';

export const DECLARED_BY = '本地使用者';

// 面板必须直说的三件事：覆盖与项目分开存、只支持单写入者、跨标签页并发没有覆盖；
// 外加 0 与留空的区别（台账规则 4）。
export const PANEL_STORAGE_NOTE = '年度覆盖存放在与项目分开的独立存储槽位里，项目对象一个字节都不改；'
  + '本台账只支持单写入者、顺序提交，跨标签页或跨窗口同时写入没有被设计、没有被验证，请勿并发写入。'
  + '参数取值填 0 是有效取值；留空表示撤销——撤销不等于 0。';

export const PANEL_UNAVAILABLE_TEXT = '当前浏览器不提供 localStorage，年度覆盖面板不可用；项目本身不受影响。';

/* ------------------------------------------------------------------ 纯 helper */

// 写入失败演示用的薄适配器：只把四个存储接口转给真实存储，另外在「已武装」时让下一次
// setItem 抛出 QuotaExceededError 类错误，然后自行解除武装（只拒绝一次）。
// 台账的「先持久化、成功后才发布」顺序会把这个异常变成一次 refused 结果，
// 不需要调用方提前 catch——失败路径是被台账自己走出来的。
export function failingStorage(base, shouldFail = () => false) {
  if (!base || typeof base.getItem !== 'function' || typeof base.setItem !== 'function') {
    throw new TypeError('failingStorage 需要一个可读写的底层存储');
  }
  let spent = false;
  return {
    getItem: key => base.getItem(key),
    setItem(key, value) {
      if (!spent && shouldFail()) {
        spent = true;
        const error = new Error('模拟存储拒绝写入：配额不足（QuotaExceededError）。');
        error.name = 'QuotaExceededError';
        throw error;
      }
      base.setItem(key, value);
    },
    removeItem: key => base.removeItem(key),
    get length() { return base.length; },
    get spent() { return spent; },
    rearm() { spent = false; }
  };
}

// 当前读数的一句话：值、来源（年度覆盖 / 基线）、以及失效时的原因。纯函数。
// 显式区分「没有采用」与「采用 0」：adoptedValue 为 null 时不写 0。
export function ledgerStatusText(reading) {
  if (!reading || typeof reading !== 'object') return '尚未选择年份与路径，读不到年度覆盖。';
  const value = displayValue(reading.value);
  let sentence = '当前读数：' + (value === null ? '缺失（该年没有可用值）' : value)
    + '；来源：' + (reading.adopted ? '年度覆盖' : '基线');
  if (reading.adopted) {
    sentence += '（记录 ' + (reading.recordId ?? '未知') + '，基线 ' + (displayValue(reading.baseline) ?? '缺失') + '）';
  } else if (reading.reason) {
    sentence += '（' + reading.reason + '）';
  } else if (reading.operation === 'revoke') {
    sentence += '（最近一次记录是撤销年度覆盖）';
  } else {
    sentence += '（该年没有年度覆盖记录）';
  }
  return sentence + '。';
}

// 历史行：只读展示，记录永不改写、永不删除。最新一条若因路径版本或冻结基线对不上而失效，
// 标成「基线已变，待重新采用」，并且它的旧值仍然读得出来（valueText / rawValue）。
export function overrideRows(history = [], reading = null) {
  const list = Array.isArray(history) ? history : [];
  const latestId = reading && typeof reading === 'object' ? (reading.recordId ?? null) : null;
  const adopted = Boolean(reading && reading.adopted);
  const reason = reading && typeof reading === 'object' ? (reading.reason ?? null) : null;
  return list.map((record, index) => {
    const isLatest = latestId !== null && record.id === latestId;
    const set = record.operation !== 'revoke';
    const stale = set && isLatest && !adopted && Boolean(reason);
    const current = set && isLatest && adopted;
    const statusText = !set ? '撤销记录（回到基线）'
      : current ? '当前采用（来源：年度覆盖）'
        : stale ? '基线已变，待重新采用'
          : isLatest ? '当前记录（未作为采用值）' : '历史记录（已被后续记录取代）';
    return {
      id: record.id ?? null,
      seq: record.seq ?? null,
      index: index + 1,
      operation: set ? 'set' : 'revoke',
      latest: isLatest,
      current,
      stale,
      valueText: set ? displayValue(record.value) : null,
      rawValue: set ? (record.value ?? null) : null,
      unit: record.unit ?? null,
      baselineText: displayValue(record.baseline?.reading ?? null),
      pathVersionText: 'v' + (record.pathVersion ?? '未知'),
      staleNote: stale ? reason : null,
      statusText
    };
  });
}

/* -------------------------------------------------------------------- 面板 */

function browserStorage() {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;   // 隐私模式等：拿不到就当不可用，不抛出去打断时间轴模块。
  }
}

export function overrideLedgerPanel({ context } = {}) {
  const root = el('section', { class: 'override-ledger', 'aria-label': '年度覆盖台账（写入独立槽位）' });
  const base = browserStorage();

  // 唯一一个台账实例：存储是本文件的薄适配器（包着 window.localStorage），notify 直达全局提示。
  // 不使用内存存储：面板演示的就是真实落盘与真实写入失败。
  let failArmed = false;
  let failNext = false;
  const adapter = base ? failingStorage(base, () => failNext) : null;
  const ledger = adapter ? createOverrideLedger({
    storage: adapter,
    notify: notice => {
      const what = notice.record.operation === 'revoke' ? '已撤销' : '已采用 ' + (displayValue(notice.record.value) ?? '缺失');
      context?.notify?.('年度覆盖' + what + '（记录 ' + notice.record.id + '）；该年历史共 ' + notice.historyCount + ' 条。');
    }
  }) : null;

  let project = null;
  let target = { descriptorId: null, path: null };
  let year = null;
  let referenceStateId = null;
  let inputValue = '';
  let valueInput = null;
  let lastAttempt = null;

  // 挂载即 load：槽位按项目 ID 归属，换项目时重新装载。
  try {
    const initial = context?.store?.read?.();
    if (ledger && initial && initial.id) { ledger.load(initial); project = initial; }
  } catch { /* 读不到就先空着，update 时会再试 */ }

  function safeHistory() {
    if (!ledger || !project || !target.path || !Number.isInteger(year)) return [];
    try { return ledger.history(project, { year, pathId: target.path.id }); } catch { return []; }
  }

  function currentReading() {
    if (!ledger || !project || !target.path || !Number.isInteger(year)) return null;
    try { return ledger.reading(project, { year, pathId: target.path.id, regionId: project.scope?.regionId ?? null }); } catch { return null; }
  }

  function slotText(raw) {
    return raw === null || raw === undefined ? '空（没有槽位字节）' : '槽位长度 ' + String(raw).length + ' 字符';
  }

  function sourceLine(reading, path) {
    const unit = typeof path.unit === 'string' && path.unit ? ' ' + path.unit : '';
    const parts = [
      '来源：' + (reading.adopted ? '年度覆盖' : '基线'),
      '当前采用值：' + (reading.adopted
        ? (displayValue(reading.adoptedValue) ?? '缺失') + unit
        : '无（读基线 ' + (displayValue(reading.baseline) ?? '缺失') + unit + '）'),
      '该年历史：' + reading.historyCount + ' 条',
      '路径版本：v' + (reading.pathVersion ?? '未知')
    ];
    if (reading.reason) parts.push(reading.reason);
    return parts.join('；') + '。';
  }

  // 一次保存/撤销的完整尝试。写入失败不提前拦截：交给台账 persist-then-publish 的顺序产出一份
  // refused 结果，再把「提交前 / 提交后」的槽位、修订、通知次数与读数逐项摆出来比对。
  function runCommand(operation, input) {
    if (!ledger || !project || !target.path || !Number.isInteger(year)) return;
    const before = {
      raw: ledger.slotRaw(), revision: project.revision, notify: ledger.notifyCount(),
      reading: ledgerStatusText(currentReading()), history: safeHistory().length
    };
    const armed = failArmed;
    failNext = armed;
    if (armed) failArmed = false;   // 「模拟写入失败」只作用于下一次保存
    let result;
    try {
      result = operation === 'revoke'
        ? ledger.revoke(project, input)
        : ledger.commit(project, ledger.preview(project, input));
    } catch (error) {
      result = { status: 'refused', code: error?.code ?? 'INVALID_COMMAND', message: error?.message ?? String(error) };
    } finally {
      failNext = false;
    }
    const after = {
      raw: ledger.slotRaw(), revision: project.revision, notify: ledger.notifyCount(),
      reading: ledgerStatusText(currentReading()), history: safeHistory().length
    };
    const unchanged = after.raw === before.raw && after.revision === before.revision
      && after.notify === before.notify && after.reading === before.reading && after.history === before.history;
    lastAttempt = { operation, result, before, after, unchanged, armed };
    render();
  }

  function save() {
    if (!ledger || !project || !target.path || !Number.isInteger(year)) return;
    if (valueInput && valueInput.validity && valueInput.validity.badInput) {
      lastAttempt = { inputError: '输入未完成：请补成数字，或清空后用「撤销年度覆盖」。未完成的输入既不是 0，也不是撤销。' };
      render();
      return;
    }
    const raw = inputValue;
    if (raw.trim() === '') {
      inputValue = '';
      runCommand('revoke', { year, pathId: target.path.id, declaredBy: DECLARED_BY, reason: '留空保存即撤销年度覆盖' });
      return;
    }
    runCommand('set', {
      year, pathId: target.path.id, value: raw, referenceStateId,
      declaredBy: DECLARED_BY, reason: '采用年度覆盖 ' + raw.trim()
    });
  }

  function revoke() {
    if (!ledger || !project || !target.path || !Number.isInteger(year)) return;
    inputValue = '';
    runCommand('revoke', { year, pathId: target.path.id, declaredBy: DECLARED_BY, reason: '撤销年度覆盖' });
  }

  function attemptLines() {
    if (!lastAttempt) return null;
    if (lastAttempt.inputError) return el('p', { class: 'override-ledger-refused', 'data-override-attempt': 'input-error' }, lastAttempt.inputError);
    const { result, before, after, unchanged, armed } = lastAttempt;
    if (result.status === 'published') {
      const what = result.record.operation === 'revoke' ? '撤销年度覆盖' : '采用 ' + (displayValue(result.record.value) ?? '缺失');
      return el('p', { class: 'override-ledger-notice', 'data-override-attempt': 'published' },
        '已保存：' + result.record.id + '（' + what + '）；该年历史 ' + after.history + ' 条，已通知 ' + after.notify + ' 次。');
    }
    if (result.status === 'unchanged') {
      return el('p', { class: 'override-ledger-notice', 'data-override-attempt': 'unchanged' },
        '有效内容与最近一条记录相同，没有新增记录，也没有再次写入槽位；通知保持 ' + after.notify + ' 次。');
    }
    return el('div', { class: 'override-ledger-refused', 'data-override-attempt': 'refused' },
      el('p', { class: 'override-ledger-refused-line' },
        (armed ? '模拟开关已生效：这次写入被存储层拒绝。' : '') + '写入被拒绝（' + result.code + '）：' + result.message),
      el('p', { class: 'override-ledger-unchanged' },
        '未改变：修订 r' + after.revision + '；' + slotText(after.raw) + '；通知 ' + after.notify + ' 次；该年历史 '
        + after.history + ' 条；读数「' + after.reading + '」。与提交前逐项比对：' + (unchanged ? '全部一致' : '检测到差异，请立即检查') + '。'),
      el('p', { class: 'override-ledger-unchanged' },
        '提交前：修订 r' + before.revision + '；' + slotText(before.raw) + '；通知 ' + before.notify + ' 次；该年历史 ' + before.history + ' 条。'));
  }

  function historyList(rows) {
    if (!rows.length) {
      return el('p', { class: 'override-ledger-empty' }, '该年还没有任何年度覆盖记录。历史只增不改；失效的记录也会一直保留。');
    }
    return el('ol', { class: 'override-ledger-history' }, ...rows.map(row => el('li', {
      class: 'override-row' + (row.current ? ' override-row-current' : '') + (row.stale ? ' override-row-stale' : ''),
      'data-override-row': row.id ?? '', 'data-override-row-status': row.statusText
    },
    el('p', { class: 'override-row-status' }, '#' + row.seq + ' · ' + row.statusText),
    el('p', { class: 'override-row-body' }, row.operation === 'set'
      ? '采用值 ' + (row.valueText ?? '缺失') + (row.unit ? ' ' + row.unit : '') + '；写记录时基线 ' + (row.baselineText ?? '缺失') + '；路径 ' + row.pathVersionText
      : '撤销：回到该年基线 ' + (row.baselineText ?? '缺失') + '；路径 ' + row.pathVersionText),
    row.staleNote ? el('p', { class: 'override-row-body' }, row.staleNote) : null,
    el('p', { class: 'override-row-body muted' }, '记录 ' + (row.id ?? '未知') + '；记录只增不改，不会被删除，也不会被自动重新采用。'))));
  }

  function render() {
    root.replaceChildren(el('h3', {}, '年度覆盖台账'));
    if (!ledger) { root.append(el('p', { class: 'warning-text' }, PANEL_UNAVAILABLE_TEXT)); return; }
    if (!project) { root.append(el('p', {}, '尚未载入项目。')); return; }
    const path = target.path;
    if (!path) {
      root.append(el('p', {}, '请先在上方选择或保存一条路径：年度覆盖按地区、路径与年份分别保存，不自动套用到其他路径或年份。'));
      return;
    }
    const years = [...(project.scope?.years ?? [])].filter(Number.isInteger).sort((a, b) => a - b);
    if (!years.length) { root.append(el('p', {}, '项目尚未指定研究年份，无法保存年度覆盖。')); return; }
    if (!years.includes(year)) year = years[0];
    const states = (project.data?.states ?? []).filter(state => state.descriptorId === path.descriptorId);

    const yearSelect = el('select', {
      class: 'override-ledger-year', 'data-override-year': '1', 'aria-label': '年度覆盖年份',
      onchange: event => { const next = Number(event.target.value); if (Number.isInteger(next)) { year = next; referenceStateId = null; render(); } }
    }, ...years.map(value => el('option', { value: String(value) }, String(value))));
    yearSelect.value = String(year);

    const referenceSelect = el('select', {
      class: 'override-ledger-reference', 'data-override-reference': '1', 'aria-label': '对照状态（写入记录）',
      onchange: event => { referenceStateId = event.target.value || null; render(); }
    }, el('option', { value: '' }, '未选择对照状态'), ...states.map(state => el('option', { value: state.id }, state.label)));
    referenceSelect.value = referenceStateId ?? '';

    valueInput = el('input', {
      type: 'number', step: 'any', class: 'override-ledger-value', 'data-override-value': '1',
      'aria-label': '参数取值（0 是有效值；留空表示撤销）', placeholder: '留空表示撤销', value: inputValue,
      oninput: event => { inputValue = event.target.value; }
    });

    const failBox = el('input', {
      type: 'checkbox', class: 'override-ledger-fail-box', 'data-override-fail': '1', 'aria-label': '模拟写入失败（仅下一次保存）',
      onchange: event => { failArmed = Boolean(event.target.checked); }
    });
    failBox.checked = failArmed;

    const reading = currentReading();
    const rows = overrideRows(safeHistory(), reading);

    root.append(
      el('div', { class: 'override-ledger-controls' },
        el('label', {}, '年份', yearSelect),
        el('label', {}, '对照状态', referenceSelect),
        el('label', {}, '参数取值', valueInput)),
            el('div', { class: 'override-ledger-actions' },
        el('button', { type: 'button', class: 'button primary-action', 'data-override-save': '1', onclick: save }, '保存年度覆盖'),
        el('button', { type: 'button', class: 'button', 'data-override-revoke': '1', onclick: revoke }, '撤销年度覆盖'),
        el('label', { class: 'override-ledger-fail' }, failBox, '模拟写入失败（仅下一次保存）')),
      el('p', {
        class: 'override-ledger-readout', 'data-override-reading': reading ? (reading.adopted ? 'override' : 'baseline') : 'none'
      }, ledgerStatusText(reading)),
      reading ? el('p', { class: 'override-ledger-source', 'data-override-source': reading.adopted ? 'override' : 'baseline' }, sourceLine(reading, path)) : null,
      attemptLines(),
      el('div', { class: 'override-ledger-history-wrap' },
        el('h4', { class: 'override-ledger-history-title' }, '该年历史（' + rows.length + ' 条）',
          el('span', { class: 'muted' }, '　路径 v' + (path.version ?? '未知') + ' · 台账通知 ' + ledger.notifyCount() + ' 次')),
        historyList(rows))
    );
  }

  function update(nextProject, nextTarget = {}) {
    if (!ledger) { render(); return; }
    if (!nextProject || !nextProject.id) { project = nextProject ?? null; render(); return; }
    if (ledger.projectId !== nextProject.id) ledger.load(nextProject);
    project = nextProject;
    target = { descriptorId: nextTarget.descriptorId ?? null, path: nextTarget.path ?? null };
    render();
  }

  // context.store.subscribe 的复核入口：项目换了就按新项目 ID 重新 load，否则原样保留内存台账
  // （历史与计数不该被一次普通重渲染清掉）。
  function sync(nextProject) {
    if (!ledger || !nextProject || !nextProject.id) return;
    if (ledger.projectId !== nextProject.id) { ledger.load(nextProject); project = nextProject; }
  }

  render();
  return { root, update, sync };
}
