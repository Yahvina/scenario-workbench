import { el } from '../../core/ui.mjs';

export function mount(container, context) {
  const project = context.store.read();
  let dirty = false;
  const status = el('p', { class: 'message', role: 'status', 'aria-live': 'polite' });
  const title = el('input', { id: 'project-title', required: true, maxlength: 120, value: project.title });
  const region = el('input', { id: 'project-region', maxlength: 120, placeholder: '例如：京津冀；也可暂不指定', value: project.scope.regionId || '' });
  const years = el('input', { id: 'project-years', placeholder: '例如：2026, 2030, 2035', value: project.scope.years.join(', '), 'aria-describedby': 'years-help' });
  const field = (label, input, extra = null, wide = false) => el('div', { class: 'field' + (wide ? ' wide' : '') }, el('label', { for: input.id }, label), input, extra);
  const form = el('form', {}, el('div', { class: 'form-grid' },
    field('项目名称', title, null, true),
    field('研究地区', region),
    field('研究年份', years, el('small', { id: 'years-help' }, '用逗号分隔日历年份，暂不设年份也可保存。'))),
    el('div', { class: 'actions' }, el('button', { class: 'button primary-action', type: 'submit' }, '保存项目范围')), status);
  const markDirty = () => { dirty = true; status.textContent = '有未保存的修改'; status.className = 'message dirty'; };
  form.addEventListener('input', markDirty);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const raw = years.value.trim();
    const tokens = raw ? raw.split(/[,，、\s]+/) : [];
    if (tokens.some(value => !/^\d{4}$/.test(value))) {
      status.textContent = '年份请填写四位整数，并用逗号分隔。';
      status.className = 'message error';
      years.setAttribute('aria-invalid', 'true');
      return;
    }
    const result = context.actions.updateProjectDetails({ title: title.value.trim(), scope: { regionId: region.value.trim() || null, years: tokens.map(Number).sort((a, b) => a - b) } });
    status.className = result.ok ? 'message' : 'message error';
    status.textContent = result.ok ? context.persistenceState().ok ? '项目范围已保存到浏览器。' : '范围已更新到当前页面；浏览器保存失败，请下载备份。' : result.error.message;
    if (result.ok) { dirty = false; years.removeAttribute('aria-invalid'); context.notify(context.persistenceState().ok ? '项目范围已保存到浏览器' : '范围已更新，但尚未保存到浏览器'); }
  });
  const loadDemo = () => {
    const current = context.store.read();
    if ((dirty || current.data.taxonomy.length || current.scope.years.length || current.title !== '未命名情景项目') && !confirm('载入机制示例会替换当前项目。需要保留时，请先下载项目备份。继续载入吗？')) return;
    dirty = false;
    context.loadDemo();
  };
  const backup = el('input', { type: 'file', id: 'project-import', accept: '.json,application/json', class: 'inline-file' });
  backup.addEventListener('change', async () => {
    const file = backup.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { status.textContent = '备份超过5MB，本轮暂不支持载入。'; status.className = 'message error'; return; }
    if (!confirm('恢复备份会替换当前项目。继续恢复吗？')) { backup.value = ''; return; }
    try {
      const value = JSON.parse(await file.text());
      const result = context.actions.replaceProject(value);
      if (!result.ok) throw new Error(result.error.message);
      dirty = false;
      context.refresh();
      context.notify('项目备份已恢复');
    } catch (error) { status.textContent = '备份未载入：' + error.message; status.className = 'message error'; }
  });
  container.append(el('div', { class: 'section-head' }, el('h2', {}, '先确定这次要研究的范围'), el('p', {}, '从一个项目开始。后续描述符、时间路径和检验结果都归属于这个项目。')), form,
    el('hr', { class: 'section-divider' }),
    el('h2', {}, '接下来，逐步构建你的方案'),
    el('ol', { class: 'workflow' },
      ...[['描述符与状态', '从多级分类选择因素，查看映射变量和已有状态定义。', '可使用'], ['政策实施路径', '按年份编辑节点、拖动数值并追踪修改来源。', '可使用'], ['影响关系与矩阵', '记录有向状态对评分、依据及适用范围；CIB求解待实现。', '可使用']].map(([name, text, status]) => el('li', {}, el('div', {}, el('h3', {}, name), el('p', {}, text)), el('span', {}, status)))),
    el('div', { class: 'actions' }, el('button', { class: 'button secondary', onclick: () => context.navigate('elements') }, '选择描述符'), el('button', { class: 'button text', onclick: loadDemo }, '载入机制示例')),
    el('p', { class: 'muted' }, '机制示例只用于验证软件，包含六层分类和两个示例变量，不代表真实政策。'),
    el('hr', { class: 'section-divider' }), el('h2', {}, '保存与恢复'),
    el('p', { class: 'muted' }, '本浏览器自动保存已提交的内容；下载备份便于跨设备保留。'),
    el('div', { class: 'actions' }, el('button', { class: 'button secondary', onclick: context.exportProject }, '下载项目备份'), el('button', { class: 'button secondary', onclick: context.captureSnapshot }, '记录未检验快照')),
    el('div', { class: 'field', style: 'margin-top:16px' }, el('label', { for: 'project-import' }, '从JSON备份恢复'), backup));
  const unload = event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
  window.addEventListener('beforeunload', unload);
  return { dispose: () => window.removeEventListener('beforeunload', unload), canLeave: () => !dirty || confirm('有未保存的范围修改。离开并放弃这些修改吗？') };
}
