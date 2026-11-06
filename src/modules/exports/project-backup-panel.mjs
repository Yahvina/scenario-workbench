// 项目备份与恢复：从首页搬到这里，与命名方案、检验归档同处「保存与导出」。
// 首页只负责定范围；备份、恢复、示例载入都是保存范畴的动作。
import { el } from '../../core/ui.mjs';

export function projectBackupPanel(host, context) {
  const root = el('section', { class: 'project-backup', 'data-project-backup': '' });
  const status = el('p', { class: 'backup-status', role: 'status' });
  const file = el('input', { type: 'file', id: 'project-import', accept: '.json,application/json', class: 'inline-file' });
  file.addEventListener('change', async () => {
    const picked = file.files[0];
    if (!picked) return;
    if (picked.size > 5 * 1024 * 1024) { status.textContent = '备份超过5MB，本轮暂不支持载入。'; return; }
    if (!confirm('恢复备份会替换当前项目。继续恢复吗？')) { file.value = ''; return; }
    try {
      const value = JSON.parse(await picked.text());
      const result = context.actions.replaceProject(value);
      if (!result.ok) throw new Error(result.error.message);
      context.refresh();
      context.notify('项目备份已恢复');
      status.textContent = '项目备份已恢复。';
    } catch (error) { status.textContent = '备份未载入：' + error.message; }
  });

  const loadDemo = () => {
    const current = context.store.read();
    const hasWork = current.data.taxonomy.length || current.scope.years.length || current.title !== '未命名情景项目';
    if (hasWork && !confirm('载入机制示例会替换当前项目。需要保留时，请先下载项目备份。继续载入吗？')) return;
    context.loadDemo();
  };
  const loadMechanism = () => {
    const current = context.store.read();
    const hasWork = current.data.taxonomy.length || current.scope.years.length || current.title !== '未命名情景项目';
    if (hasWork && !confirm('载入机制演示会替换当前项目。需要保留时，请先下载项目备份。继续吗？')) return;
    context.loadMechanism();
  };

  // 项目改名：首页不再承担命名，改名在这里。
  const titleInput = el('input', { id: 'project-title-edit', maxlength: '120', 'aria-label': '项目名称' });
  titleInput.addEventListener('input', () => { renameMsg.textContent = ''; });
  const renameMsg = el('p', { class: 'backup-status', role: 'status' });
  const rename = el('button', { class: 'button secondary', type: 'button' }, '保存项目名称');
  rename.addEventListener('click', () => {
    try {
      const current = context.store.read();
      const value = titleInput.value.trim();
      if (!value) throw new Error('项目名称不能为空');
      if (value === current.title) { renameMsg.textContent = '名称没有变化。'; return; }
      const result = context.actions.updateProjectDetails({ title: value, scope: current.scope });
      if (!result.ok) throw new Error(result.error.message);
      renameMsg.textContent = context.persistenceState().ok
        ? '项目名称已改为「' + value + '」。'
        : '名称已改到当前页面，但浏览器保存失败，请先下载备份。';
    } catch (error) { renameMsg.textContent = '未改名：' + error.message; }
  });
  const fillTitle = () => { titleInput.value = context.store.read().title; };
  fillTitle();
  const off = context.store.subscribe(fillTitle);

  root.append(
    el('h3', {}, '项目名称'),
    el('div', { class: 'field' }, el('label', { for: 'project-title-edit' }, '当前项目名称'), titleInput),
    el('div', { class: 'actions' }, rename),
    renameMsg,
    el('h3', {}, '项目备份与恢复'),
    el('p', { class: 'v5-hint' }, '备份保存范围、数据与选择，不含检验结果；换电脑或清缓存前先下载一份。'),
    el('div', { class: 'actions' },
      el('button', { class: 'button secondary', type: 'button', onclick: context.exportProject }, '下载项目备份'),
      el('button', { class: 'button secondary', type: 'button', onclick: context.captureSnapshot }, '记录未检验快照')),
    el('div', { class: 'field' }, el('label', { for: 'project-import' }, '从 JSON 备份恢复'), file),
    el('div', { class: 'actions' },
      el('button', { class: 'button text', type: 'button', onclick: loadDemo }, '载入机制示例'),
      el('button', { class: 'button text', type: 'button', onclick: loadMechanism }, '载入机制演示（含冲突）')),
    status);
  host.append(root);
  return () => { off(); root.remove(); };
}
