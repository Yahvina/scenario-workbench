import {savedWorkPanel} from './saved-work-panel.mjs';
import {statusLabel} from '../solver/presentation.mjs';
import { el } from '../../core/ui.mjs';
import {readRunSummary,readRunArchive,subscribeRunSummary} from '../solver/index.mjs';

function createRunSave(context){
  const runSave=el('section',{'data-flow-save':''});
  function renderRunSave(){
    const summary=readRunSummary(context.store),archive=readRunArchive(context.store);
    const download=el('button',{class:'button secondary',disabled:!archive,onclick:()=>{const current=readRunArchive(context.store);if(!current)return;const url=URL.createObjectURL(new Blob([JSON.stringify(current,null,2)],{type:'application/json'})),a=el('a',{href:url,download:'cib-archive.json'});a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}},'下载当前查看的检算JSON归档');
    runSave.replaceChildren(el('h3',{},'检算结果单独保存'),el('p',{},summary?'本会话当前查看的检算归档：'+statusLabel(summary.status)+'；年份 '+(summary.year??'尚无合法输入')+'；冻结修订 '+summary.revision+'；成立数 '+(summary.count===null?'未定':summary.count)+(summary.stale?'；旧输入已过期，归档仍可保存。':'；归档保留冻结输入。'):'本会话还没有检算归档。'),el('p',{},'项目备份保存范围、数据和选择，不包含检算结果或矩阵交接候选。检算页JSON包含冻结矩阵、结果与诊断；可在检算页选择旧归档，下载目标随之切换。刷新后本会话归档丢失，请先下载。'),download,el('button',{class:'button secondary',onclick:()=>context.navigate('solver')},'前往检算页查看与保存'),el('p',{class:'muted'},'当前可下载JSON项目备份和检算归档；Word、Excel及完整报告尚未提供。'));
  }
  return {runSave,renderRunSave};
}

export function mountSaving(container,context){
 const {runSave,renderRunSave}=createRunSave(context);
 container.append(el("h2",{},"保存与导出"),el("p",{},"保存项目输入与当前查看的检算归档；完整可读报告将在后续工作包提供。"),el("button",{class:"button",onclick:context.exportProject},"下载项目备份"),el("button",{class:"button",onclick:()=>context.navigate("workspace")},"前往项目页恢复备份"),runSave);
 const offLibrary=savedWorkPanel(container,context);const offStore=context.store.subscribe(renderRunSave),offRun=subscribeRunSummary(renderRunSave);renderRunSave();
 return ()=>{offStore();offRun();offLibrary();};
}

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
  const optionalTime=el('button',{class:'button secondary',onclick:()=>context.navigate('timeline')},'可选：设置时间路径');
  const loadDemo = () => {
    const current = context.store.read();
    if ((dirty || current.data.taxonomy.length || current.scope.years.length || current.title !== '未命名情景项目') && !confirm('载入机制示例会替换当前项目。需要保留时，请先下载项目备份。继续载入吗？')) return;
    dirty = false;
    context.loadDemo();
  };
  const backup = el('input', { type: 'file', id: 'project-import', accept: '.json,application/json', class: 'inline-file' });
  const {runSave,renderRunSave}=createRunSave(context);
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
      ...[['描述符与状态', '选择关注范围与已有具体变量；向当前项目加入框架时保留已保存的名称和范围。', '可使用'], ['政策实施路径', '按年份编辑节点、拖动数值并追踪修改来源；时间路径不会自动驱动动态CIB。', '可使用'], ['影响关系与矩阵', '记录有向状态对评分，核对适用范围后发送候选到检算页。', '可使用'], ['精确CIB检验', '明确采用矩阵并确认假设，查看内部一致性、冲突及逐项解释。', '可使用']].map(([name, text, status]) => el('li', {}, el('div', {}, el('h3', {}, name), el('p', {}, text)), el('span', {}, status)))),
    el('div', { class: 'actions' }, el('button', { class: 'button secondary', onclick: () => context.navigate('elements') }, '选择描述符'), optionalTime, el('button', { class: 'button text', onclick: loadDemo }, '载入机制示例')),
    el('p', { class: 'muted' }, '机制示例只用于验证软件，包含六层分类和两个示例变量，不代表真实政策。'),
    el('hr', { class: 'section-divider' }), el('h2', {}, '保存与恢复'),
    el('p', { class: 'muted' }, '本浏览器自动保存已提交的内容；下载备份便于跨设备保留。'),
    el('div', { class: 'actions' }, el('button', { class: 'button secondary', onclick: context.exportProject }, '下载项目备份'), el('button', { class: 'button secondary', onclick: context.captureSnapshot }, '记录未检验快照')),
    el('div', { class: 'field', style: 'margin-top:16px' }, el('label', { for: 'project-import' }, '从JSON备份恢复'), backup),runSave);
  const offLibrary=savedWorkPanel(container,context);const offStore=context.store.subscribe(renderRunSave),offRun=subscribeRunSummary(renderRunSave);renderRunSave();
  const unload = event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
  window.addEventListener('beforeunload', unload);
  return { dispose: () => {window.removeEventListener('beforeunload', unload);offStore();offRun();offLibrary();}, canLeave: () => !dirty || confirm('有未保存的范围修改。离开并放弃这些修改吗？') };
}
