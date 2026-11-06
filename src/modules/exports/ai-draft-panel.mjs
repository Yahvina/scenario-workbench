// P8：AI 草案（接口与接线演示）。
// 本轮口径：界面上不自动调用模型。演示路径是
//   复制提示词 → 在你自己选的服务里生成 → 把回复粘贴回来 → 逐条看出处 → 勾选采用。
// 这样做有三条明确的好处，也是本轮刻意不自动调用的原因：
// 1. 草案的每一步都可停可查：没有网络也能走完整条路径；
// 2. 出处分级不会被一次"看起来对"的回复带过去；
// 3. 采用是显式动作，草案本身不写任何分数、数值或结构。
// 页面只提供「检查本地服务」这一个只读按钮，它只列模型名，不生成任何草案。
import { el } from '../../core/ui.mjs';
import {
  DEFAULT_DRAFT_MODEL, OLLAMA_DEFAULT_BASE_URL, REVIEW_MARK,
  adoptDraft, buildDraftPrompt, createOllamaTransport, describeSource,
  itemStatusText, listModels, materialText, parseDraft
} from './ai-draft.mjs';

export function aiDraftPanel(container, context) {
  const section = el('section', { class: 'exports-module', 'data-ai-draft': '' });
  const status = el('p', { class: 'exports-status', role: 'status', 'aria-live': 'polite', 'data-draft-status': '' });
  const workbench = el('div', { 'data-draft-workbench': '' });
  section.append(
    el('h2', {}, 'AI 草案（接口演示，不自动调用模型）'),
    el('p', {}, '这里演示的是接口与接线：把提示词交给任意一个你选择的模型服务，再把回复粘贴回来。本轮界面不会自动发起生成，也不会替你决定采用哪一条。'),
    el('ul', { class: 'exports-gaps' },
      el('li', {}, '草案只新增待核条目：不写评分、不写数值、不新建或改动描述符与状态、不动时间路径。'),
      el('li', {}, '每条都带出处分级：只在材料里找到原文才算「有出处」，只对上名称的一律标「' + REVIEW_MARK + '」。'),
      el('li', {}, '采用必须由你逐条勾选；被采用的条目写成本地证据记录，出处标为「用户假设」，不冒充政策或论文。')),
    workbench, status
  );

  let parsed = null;

  function projectInputs() {
    const project = context.store.read();
    const selected = new Set(project.selection.descriptorIds);
    const descriptors = project.data.descriptors.filter(item => selected.has(item.id));
    return { project, descriptors, states: project.data.states };
  }

  function renderWorkbench() {
    const { project, descriptors, states } = projectInputs();
    const material = el('textarea', { id: 'draft-material', rows: '6', 'aria-label': '要交给模型的材料' },
      '在此粘贴一段材料。可以是一段政策摘要、一段会议记录或你自己的描述。');
    const promptBox = el('pre', { class: 'exports-prompt', 'data-draft-prompt': '' });
    const buildPrompt = () => {
      const { system, user } = buildDraftPrompt({ material: material.value, project, descriptors, states });
      promptBox.textContent = '【系统】\n' + system + '\n\n【用户】\n' + user;
    };
    material.addEventListener('input', buildPrompt);

    const serviceNote = el('p', { class: 'exports-source', 'data-draft-service': '' });

    const checkButton = el('button', { class: 'button secondary', type: 'button', 'data-draft-check': '' }, '检查本地模型服务（只列模型，不生成）');
    const checkResult = el('p', { class: 'exports-source', 'data-draft-models': '' });
    checkButton.addEventListener('click', async () => {
      checkResult.textContent = '正在检查 ' + OLLAMA_DEFAULT_BASE_URL + ' …';
      try {
        const names = await listModels({ transport: createOllamaTransport() });
        checkResult.textContent = names.length
          ? '本地服务可用，已安装模型：' + names.join('、') + '。这只是可用性检查，没有生成任何草案。'
          : '本地服务有响应，但没有列出任何模型。请先在 Ollama 里拉取一个模型。';
      } catch (error) {
        checkResult.textContent = '未能连接本地模型服务：' + (error?.message || String(error)) + '。这不影响下方粘贴回复的演示路径。';
      }
    });

    const reply = el('textarea', { id: 'draft-reply', rows: '6', 'aria-label': '把模型回复粘贴回来' });
    const parseButton = el('button', { class: 'button', type: 'button', 'data-draft-parse': '' }, '读取回复并列出候选');
    const listBox = el('div', { 'data-draft-items': '' });

    const adoptButton = el('button', { class: 'button', type: 'button', disabled: true, 'data-draft-adopt': '' }, '采用勾选的条目');
    adoptButton.addEventListener('click', () => {
      if (!parsed) return;
      const boxes = [...listBox.querySelectorAll('input[type=checkbox]')];
      const selectedIds = boxes.filter(box => box.checked).map(box => box.value);
      if (!selectedIds.length) { status.textContent = '没有勾选任何条目：未写入任何内容。'; return; }
      const result = adoptDraft({ project: context.store.read(), items: parsed.items, selectedIds });
      if (!result.adopted.length) {
        status.textContent = '没有条目可以写入：' + result.rejected.map(item => (item.text || item.id) + '（' + item.reason + '）').join('；');
        return;
      }
      const written = context.actions.replaceProject(result.project);
      if (!written.ok) { status.textContent = '写入失败：' + written.error.message + '。项目未改变。'; return; }
      if (context.persistenceState && !context.persistenceState().ok) {
        status.textContent = '已写入当前页面，但浏览器保存失败，请下载项目备份。';
        return;
      }
      status.textContent = '已采用 ' + result.adopted.length + ' 条，写成用户假设证据' +
        (result.rejected.length ? '；未写入 ' + result.rejected.length + ' 条（' + result.rejected.map(item => item.reason).join('；') + '）' : '') +
        '。项目修订号已 +1；没有写入任何评分或数值。';
    });

    parseButton.addEventListener('click', () => {
      const text = reply.value.trim();
      if (!text) { status.textContent = '回复为空：没有可解析的内容。'; return; }
      const result = parseDraft({ text, material: material.value, descriptors, states });
      parsed = result.length ? { items: result } : null;
      if (!parsed) { listBox.replaceChildren(el('p', { class: 'exports-gaps' }, '没有解析出候选条目。')); adoptButton.disabled = true; status.textContent = ''; return; }
      listBox.replaceChildren(
                ...result.map(item => {
          const box = el('input', { type: 'checkbox', value: item.id, id: 'draft-' + item.id });
          return el('div', { class: 'exports-draft-item', 'data-draft-item': item.needsReview ? 'review' : 'grounded' },
            box,
            el('label', { for: 'draft-' + item.id },
              el('strong', {}, itemStatusText(item)),
              el('span', {}, item.text)),
            el('small', { class: 'exports-source' }, describeSource(item.source)));
        }));
      adoptButton.disabled = false;
      status.textContent = '已列出 ' + result.length + ' 条候选。采用前请逐条核对出处。';
    });

    workbench.replaceChildren(
      el('h3', {}, '第一步：准备材料并复制提示词'),
      material,
      el('button', { class: 'button secondary', type: 'button', 'data-draft-build': '', onclick: buildPrompt }, '按当前材料与项目生成提示词'),
      promptBox,
      serviceNote, checkButton, checkResult,
      el('h3', {}, '第二步：把回复粘贴回来'),
      reply, parseButton, listBox, adoptButton
    );
    buildPrompt();
    status.textContent = '';
  }

  renderWorkbench();
  container.append(section);
  return () => {};
}
