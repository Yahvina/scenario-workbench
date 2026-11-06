// 导出结果卡：选一份冻结结果，先预览再下载；报告正文不铺在保存页上。
// 设计要点（与 docs/ROADMAP_V04 的 P5 条目一致）：
// 1. 报告只能从归档生成，不能拿"当前项目"当输入——否则读到的会是编辑中的草稿。
// 2. 当前项目只用来判断"这份归档是否已经过期"，不参与报告内容。
// 3. 未定不是 0：RunResult 为空、count 为 null、状态非 completed 都如实写"未定/未开始"。
import { el } from '../../core/ui.mjs';
import { readRunArchive } from '../solver/index.mjs';
import { createLibrary } from '../workspace/saved-work.mjs';
import { buildReport, reportToMarkdown, REPORT_FILENAME } from './report.mjs';
import { downloadText } from './download.mjs';

const SESSION_SOURCE = '本次会话的检验结果';

function archiveOptions(context) {
  const options = [];
  const session = readRunArchive(context.store);
  if (session) options.push({ id: 'session', label: SESSION_SOURCE, archive: session });
  let library = null;
  try { library = createLibrary(window.localStorage).load(); } catch (error) { library = { ok: false, error: error.message }; }
  if (library?.ok) for (const item of library.bundle.runs) options.push({ id: item.id, label: '已保存的检验记录：' + item.name, archive: item.archive });
  return { options, library };
}

function reportBody(report) {
  const blocks = [];
  blocks.push(el('p', { class: 'exports-note' },
    report.stale === true ? '过期提示：' + report.staleNote
      : report.stale === false ? '这份结果与当前项目一致。'
        : '无法判断是否过期：' + report.staleNote));
  blocks.push(el('p', { class: 'exports-note' }, '生成时间：' + (report.generatedAt || '未记录（归档没有时间戳）')));
  for (const part of report.sections) {
    blocks.push(el('h3', {}, part.heading));
    for (const line of part.lines) blocks.push(el('p', {}, line));
    if (part.table) blocks.push(el('table', { class: 'exports-table' },
      el('thead', {}, el('tr', {}, ...part.table.head.map(cell => el('th', { scope: 'col' }, cell)))),
      el('tbody', {}, ...part.table.rows.map(cells => el('tr', {}, ...cells.map(cell => el('td', {}, cell)))))));
    blocks.push(el('p', { class: 'exports-source' }, '来源：' + part.source));
  }
  blocks.push(el('h3', {}, '本次没有核到的东西'));
  if (!report.gaps.length) blocks.push(el('p', {}, '没有记录到缺项。这不等于报告已经过核对。'));
  else blocks.push(el('ul', { class: 'exports-gaps' }, ...report.gaps.map(gap => el('li', {}, gap))));
  return blocks;
}

export function reportPanel(container, context) {
  const section = el('section', { class: 'exports-card', 'data-report-panel': '' });
  const body = el('div', { 'data-report-body': '' });
  const message = el('p', { class: 'exports-status', role: 'status', 'aria-live': 'polite', 'data-report-status': '' });

  function render() {
    const { options, library } = archiveOptions(context);
    if (!options.length) {
      body.replaceChildren(el('p', { class: 'exports-gaps' },
        library?.ok
          ? '还没有可导出的检验结果：先到「检验与结果」算一次。'
          : '本地历史库无法读取，未做任何改动：' + library.error));
      message.textContent = '';
      return;
    }
    const select = el('select', { id: 'report-archive-source', 'aria-label': '选择要导出的检验结果' },
      ...options.map(option => el('option', { value: option.id }, option.label)));
    const preview = el('button', { class: 'button primary-action', type: 'button' }, '预览报告');
    const download = el('button', { class: 'button', type: 'button' }, '下载 Markdown 报告');
    let current = null;

    function build() {
      const chosen = options.find(option => option.id === select.value) || options[0];
      try { current = buildReport({ project: context.store.read(), archive: chosen.archive, generatedAt: chosen.archive?.RunResult?.createdAt || null }); }
      catch (error) { current = null; message.textContent = '未能生成报告：' + error.message; return true; }
      return false;
    }
    function openPreview() {
      if (build()) return;
      const dialog = el('dialog', { class: 'report-preview', 'aria-label': '报告预览' },
        el('div', { class: 'report-preview-hd' }, el('h3', {}, '报告预览'), el('button', { class: 'button text', type: 'button', onclick: () => dialog.close() }, '关闭')),
        el('div', { class: 'report-preview-body' }, ...reportBody(current)));
      dialog.addEventListener('close', () => dialog.remove());
      document.body.append(dialog);
      dialog.showModal();
      message.textContent = '已按所选结果生成预览；未定项如实写为“未定”，未用 0 顶替。';
    }
    preview.addEventListener('click', openPreview);
    download.addEventListener('click', () => {
      if (build() || !current) return;
      downloadText(REPORT_FILENAME, reportToMarkdown(current), 'text/markdown;charset=utf-8');
    });

    body.replaceChildren(
      el('label', { class: 'save-field' }, '结果来源', select),
      el('p', { class: 'save-hint' }, '报告只读冻结结果；不读取正在编辑的草稿。'),
      el('div', { class: 'save-actions' }, preview, download),
      message);
  }

  const off = context.store.subscribe(render);
  render();
  section.append(el('h3', {}, '导出结果'), body);
  container.append(section);
  return () => off();
}
