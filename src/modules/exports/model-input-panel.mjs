// P9 模型输入样例面板：把 model-mapping.mjs 的纯逻辑接成一屏，让人先看清这份映射的性质，再下载样例。
// 三个界面上的硬要求：
// 1. 「平台推断、未经核对」必须出现在标题下方、就在控件之前，不是在末尾的小字里；
//    下载按钮、预览 JSON 与 CSV 都重复带上它，样例离开本页面后不会变成一份没有标记的参数表。
// 2. 下拉框只列 inputCandidates()：结果型与仅文档型的映射即便能显示，也生成不出样例，
//    列出来只会让人以为它们可用。
// 3. 预览区显示的就是下载的那份 JSON：先看清再下载，下载内容与预览不会不一致。
import {el} from '../../core/ui.mjs';
import {
  MAPPING_PROVENANCE, MAPPING_GAPS, MODEL_INPUT_FILENAME,
  inputCandidates, mappingFor, buildModelInput, sampleToJson, sampleToCsv
} from './model-mapping.mjs';

// 候选条目的显示文本：名称、真实模型字段、单位三样都要看得见；
// 仅文档型没有真实文件，按「待核」标出；单位为空时如实写「单位未核」，不替它补一个。
function optionText(mapping) {
  const unit = typeof mapping.unit === 'string' && mapping.unit.trim() ? mapping.unit : '单位未核';
  const review = mapping.confidence === 'documented-only' ? '（待核）' : '';
  return mapping.descriptorLabel + '（' + mapping.descriptorId + '）' + review
    + '｜模型字段：' + (mapping.modelField === null || mapping.modelField === undefined ? '未核到' : mapping.modelField)
    + '｜单位：' + unit;
}

const hasText = value => typeof value === 'string' && value.trim() !== '';

function stateOptions(project, descriptorId) {
  const states = Array.isArray(project?.data?.states) ? project.data.states : [];
  return states.filter(state => state?.descriptorId === descriptorId);
}

export function modelInputPanel(container, context) {
  const candidates = inputCandidates();
  let currentDescriptorId = candidates.length ? candidates[0].descriptorId : '';

  const root = el('section', {class: 'exports-module', 'data-model-input': ''});
  const statusLine = el('p', {'data-model-input-status': ''}, MAPPING_PROVENANCE.label);
  const statusNote = el('p', {},
    '这份映射是平台侧逐条打开真实模型文件比对出来的：确实核对过文件是否存在、单位是否如此，'
    + '但没有核对过「状态档位如何换算成模型取值」。'
    + '请不要把它当作已核对的参数表引用；样例里每一处都写着「' + MAPPING_PROVENANCE.label + '」。');

  const mappingSelect = el('select', {
    'aria-label': '映射到哪个模型参数',
    onchange: () => { currentDescriptorId = mappingSelect.value; renderStates(); renderPreview(); }
  });
  for (const mapping of candidates) {
    mappingSelect.append(el('option', {value: mapping.descriptorId}, optionText(mapping)));
  }
  if (!candidates.length) mappingSelect.append(el('option', {value: ''}, '没有可用的映射：证据文件里没有核到承载文件的输入型或参数型描述符'));

  const stateSelect = el('select', {
    'aria-label': '选择状态',
    onchange: () => renderPreview()
  });
  const valueInput = el('input', {type: 'number', 'aria-label': '参数取值', step: 'any', oninput: () => renderPreview()});
  const noteInput = el('input', {type: 'text', 'aria-label': '备注', oninput: () => renderPreview()});
  const preview = el('pre', {'data-model-input-preview': '', style: 'white-space:pre-wrap;overflow-wrap:anywhere'});
  const message = el('p', {role: 'status', 'aria-live': 'polite'});

  const button = (name, onClick) => el('button', {class: 'button secondary', type: 'button', onclick: onClick}, name);

  // 下载与预览共用一个构造入口：预览为空时按钮也必须拒绝，不能凭界面上的旧值下载。
  function currentSample() {
    const result = buildModelInput({
      descriptorId: currentDescriptorId,
      project: context.store.read(),
      stateId: stateSelect.value,
      value: valueInput.value,
      note: noteInput.value
    });
    return result;
  }

  function download(name, text, mime) {
    const url = URL.createObjectURL(new Blob([text], {type: mime}));
    const anchor = el('a', {href: url, download: name});
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function renderStates() {
    const project = context.store.read();
    stateSelect.replaceChildren();
    const states = stateOptions(project, currentDescriptorId);
    if (!states.length) {
      stateSelect.append(el('option', {value: ''}, '当前项目里没有这个描述符的状态定义'));
      return;
    }
    stateSelect.append(el('option', {value: ''}, '请选择状态'));
    for (const state of states) stateSelect.append(el('option', {value: state.id}, hasText(state.label) ? state.label : state.id));
  }

  function renderPreview() {
    const result = currentSample();
    if (!result.ok) {
      preview.textContent = '样例还生成不了：' + result.message + '\n（代码 ' + result.code + '）';
      if (message.textContent && message.textContent !== result.message) message.textContent = result.message;
      return '';
    }
    const text = sampleToJson(result.sample);
    preview.textContent = text;
    return text;
  }

  const buttonRow = el('div', {style: 'display:flex;flex-wrap:wrap;gap:8px;margin:8px 0'},
    button('下载模型输入样例', () => {
      const result = currentSample();
      if (!result.ok) { message.textContent = '未下载：' + result.message; renderPreview(); return; }
      download(MODEL_INPUT_FILENAME + '.json', sampleToJson(result.sample), 'application/json');
      message.textContent = '已下载 JSON 样例；文件内已写明「' + MAPPING_PROVENANCE.label + '」。';
    }),
    button('下载模型输入样例（CSV）', () => {
      const result = currentSample();
      if (!result.ok) { message.textContent = '未下载：' + result.message; renderPreview(); return; }
      download(MODEL_INPUT_FILENAME + '.csv', sampleToCsv(result.sample), 'text/csv');
      message.textContent = '已下载 CSV 样例；文件内已写明「' + MAPPING_PROVENANCE.label + '」。';
    }));

  // 未核到清单与映射同等重要：把窟窿摆在样例旁边，避免只看到一条标记就以为映射完整。
  const gapsList = el('ul', {}, ...MAPPING_GAPS.map(gap => el('li', {}, gap)));

  root.append(
    el('h2', {}, '模型输入样例（平台推断）'),
    statusLine,
    statusNote,
    el('label', {style: 'display:block;margin:8px 0'}, '映射到哪个模型参数', mappingSelect),
    el('label', {style: 'display:block;margin:8px 0'}, '选择状态', stateSelect),
    el('label', {style: 'display:block;margin:8px 0'}, '参数取值', valueInput),
    el('label', {style: 'display:block;margin:8px 0'}, '备注（可留空）', noteInput),
    el('h3', {}, '将下载的样例内容'),
    el('p', {}, '下面就是点击下载后会得到的 JSON；它带着来源声明，脱离本页面也读得到映射性质。'),
    preview,
    buttonRow,
    message,
    el('h3', {}, '本次没有核到的东西'),
    el('p', {}, '以下都是平台侧没有核对到的部分，样例不会把它们补上；请勿据此认为映射已经完整。'),
    gapsList,
    el('p', {}, '证据文件：' + MAPPING_PROVENANCE.evidenceDir + MAPPING_PROVENANCE.evidenceFile
      + '；说明文件：' + MAPPING_PROVENANCE.evidenceDir + MAPPING_PROVENANCE.evidenceWriteup + '。')
  );

  container.append(root);
  renderStates();
  renderPreview();
  return root;
}
