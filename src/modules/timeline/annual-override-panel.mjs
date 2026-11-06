// P7-B 单年覆盖预览的展示辅助（只读，不写入任何状态）。
// 覆盖值只存在内存里，按项目、地区、路径 ID 与版本、年份隔离；清空与显式 0 是两条不同的读法。
import { el } from '../../core/ui.mjs';
import {
  classifyOverride, displayValue, VERDICT_TEXT, OVERRIDE_ONLY_VALUES, OVERRIDE_NO_STATE,
  bindingNoteFor
} from './annual-override.mjs';

const READING_TEXT = {
  anchor: '原始锚点', 'anchor-missing': '原始锚点（数值缺失）', interpolated: '推算值',
  'missing-breakpoint': '缺口：相邻锚点数值缺失', 'out-of-range': '缺口：该年不在节点范围内',
  'no-interpolation': '缺口：该路径不插值', 'no-points': '缺口：该路径没有节点'
};

// 显式指标绑定是本模块私有的机制约定。P7-C1 起它只能由调用方作为 binding 入参传入：
// 本文件不再读任何全局开关，也不读路径上携带的 reviewBinding。正式页面（含项目、备份
// 与恢复数据里自己带了 reviewBinding 的项目）永远拿到 binding = null，一律按未核验处理，
// 只显示待核。正向数值判定由独立测试入口显式传入绑定。公共契约未改动。

function targetOf(path) {
  return {pathId: path.id, pathVersion: path.version};
}

export function overridePreview({project, path, year, reading, states, store, binding = null, onChange = () => {}}) {
  const unit = typeof path.unit === 'string' && path.unit ? path.unit : null;
  const baseline = reading?.value ?? null;
  const target = targetOf(path);
  // 已有锚点显式关联的状态可作对照；插值点没有绑定，必须由用户显式选择，不从邻年复制。
  const recorded = (reading?.kind === 'anchor' || reading?.kind === 'anchor-missing') ? (reading.point?.stateId ?? null) : null;

  const section = el('section', {
    class: 'annual-override', 'data-annual-override': path.id,
    'data-override-year': String(year), 'data-override-version': String(path.version),
    'aria-label': '只改这一年的预览（只读）'
  });
  const readout = el('div', {class: 'annual-override-readout'});
  const input = el('input', {
    type: 'number', step: 'any', class: 'annual-override-input',
    'data-override-input': path.id, 'aria-label': '拟采用值（只改这一年，预览）', placeholder: '留空即读基线'
  });
  const stored = store.get(year, target);
  input.value = stored === null || stored === undefined ? '' : String(stored);

  function valueText(value) {
    if (value === null || value === undefined) return null;
    return displayValue(value) + (unit ? ' ' + unit : '');
  }

  function paint() {
    // binding 由调用方显式传入；正式页面恒为 null（项目数据里携带的绑定不进判定）。
    const referenceStateId = recorded ?? store.getReference(year, target) ?? null;
    const result = classifyOverride({
      baseline, override: store.get(year, target), states, referenceStateId, binding,
      year, region: project.scope?.regionId ?? null,
      qualitative: binding?.qualitative === true, multiParameter: binding?.multiParameter === true,
      missingBindingNote: bindingNoteFor(path)
    });

    const rows = [];
    rows.push(el('p', {
      class: 'annual-override-line', 'data-override-baseline': result.baseline === null ? 'none' : displayValue(result.baseline)
    }, '年份：' + year + '；基线：' + (result.baseline === null ? '缺失（该年没有基线值）' : valueText(result.baseline))
      + '（' + (READING_TEXT[reading?.kind] ?? '未知') + '）'));

    rows.push(el('p', {
      class: 'annual-override-line', 'data-override-reference': result.reference ? result.reference.status : 'none'
    }, result.reference
      ? '原选状态：' + result.reference.label + '（' + result.reference.text + '）' + (recorded ? '，来自该锚点的显式记录' : '，本次预览自选')
      : OVERRIDE_NO_STATE));

    rows.push(el('p', {
      class: 'annual-override-line annual-override-adopted',
      'data-override-value': result.cleared ? 'cleared' : displayValue(result.value)
    }, result.cleared ? '拟采用值：未填写（读基线）' : '拟采用值：' + (valueText(result.value) ?? '无法读取')));

    rows.push(el('p', {
      class: 'annual-override-verdict', 'data-override-verdict': result.verdict,
      'data-override-known-out-of-range': String(result.knownOutOfRange === true)
    }, '判定：' + VERDICT_TEXT[result.verdict]));

    if (result.reasons.length) {
      rows.push(el('ul', {class: 'annual-override-reasons'}, ...result.reasons.map(text => el('li', {}, text))));
    }
    rows.push(el('p', {
      class: 'annual-override-candidates', 'data-override-candidates': String(result.candidates.length)
    }, result.candidates.length
      ? '候选状态：' + result.candidates.map(item => item.label + '（' + item.text + '）').join('；') + '。仅展示，需你确认。'
      : '候选状态：无。'));
    rows.push(el('p', {class: 'annual-override-note muted'}, OVERRIDE_ONLY_VALUES));
    readout.replaceChildren(...rows.filter(row => row !== null && row !== undefined));
  }

  input.addEventListener('input', () => {
    // 只输负号这类未完成输入：value 读出来是空串，若当成清空就等于静默改写了预览。先拦。
    if (input.validity.badInput) {
      input.setAttribute('aria-invalid', 'true');
      readout.replaceChildren(el('p', {
        class: 'annual-override-pending warning-text', 'data-override-pending': 'incomplete'
      }, '输入未完成：请补成数字，或清空该框。未完成的输入既不是 0，也不是清空覆盖。'));
      return;
    }
    input.removeAttribute('aria-invalid');
    const raw = input.value.trim();
    store.set(year, target, raw === '' ? null : raw);
    paint();
    onChange();
  });

  const clearButton = el('button', {
    type: 'button', class: 'button annual-override-clear', 'data-override-clear': path.id,
    onclick: () => {
      input.value = '';
      input.removeAttribute('aria-invalid');
      store.set(year, target, null);
      paint();
      onChange();
    }
  }, '清空覆盖（恢复基线）');

  const reference = el('select', {
    class: 'annual-override-reference', 'data-override-reference-select': path.id,
    'aria-label': '对照状态（仅用于本次预览）',
    onchange: event => {
      store.setReference(year, target, event.target.value || null);
      paint();
      onChange();
    }
  });
  if (recorded === null) {
    reference.append(el('option', {value: ''}, '未选择对照状态'));
    for (const state of states) reference.append(el('option', {value: state.id}, state.label));
    reference.value = store.getReference(year, target) ?? '';
  }

  section.append(
    el('h5', {class: 'annual-override-title'}, '只改这一年（预览，只读）'),
    el('p', {class: 'annual-override-hint muted'},
      '在这里试算「如果这一年改成 X」：不保存、不进入检算，也不写入项目、历史库或本地存储。清空即回到基线；填 0 与清空是两件事。'),
    el('div', {class: 'annual-override-controls'},
      el('label', {}, '拟采用值', input),
      recorded === null ? el('label', {}, '对照状态', reference) : null,
      clearButton
    ),
    readout
  );
  paint();
  return {root: section, repaint: paint, input};
}
