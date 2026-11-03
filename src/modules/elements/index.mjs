import { el } from '../../core/ui.mjs';
import { resolveSelection, visibleRows } from './selection.mjs';
import { JJJ_DRAFT_CATALOG, createJJJDraftProject } from '../../fixtures/jjj-draft.mjs';
import { variableColor } from '../../core/object-colors.mjs';

function disclosure(open) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', open ? 'M4 6l4 4 4-4' : 'M6 4l4 4-4 4');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.5');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  return svg;
}

export function mount(container, context) {
  const root = el('section', { class: 'elements-module', 'aria-labelledby': 'elements-title' });
  const expanded = new Set();
  let query = '', disposed = false;
  const search = el('input', { type: 'search', id: 'elements-search', placeholder: '搜索名称或 ID' });
  const tree = el('div', { class: 'elements-tree' });
  const summary = el('div', { class: 'elements-summary', 'aria-live': 'polite' });
  const message = el('p', { role: 'status' });
  const catalog = el('div', { class: 'elements-catalog' });
  const treeInfo = el('p', { class: 'elements-tree-info muted' });
  const clear = el('button', { class: 'button secondary', onclick: () => commit([]) }, '清空选择');
  root.append(el('h2', { id: 'elements-title' }, '描述符多级选择'),
    el('p', { class: 'elements-intro' }, '从分类中找到本次关注的因素。展开查看下一级，勾选后在右侧核对进入计算的变量。'),
    catalog,
    el('label', { for: 'elements-search' }, '搜索分类'), search,
    el('div', { class: 'elements-tools' }, clear,
      el('button', { class: 'button secondary', onclick: () => { expanded.clear(); render(); } }, '收起全部'),
      el('details', { class: 'elements-rules' }, el('summary', {}, '选择规则'), el('p', {}, '可在任意层停止，也可混合深度。父子分类可同时保留，变量按ID去重。无映射分类保留为待配置，不自动纳入后代；搜索与展开不改变选择。'))),
    message, el('div', { class: 'elements-columns' }, el('section', { class: 'elements-browser', 'aria-label': '分类浏览' }, treeInfo, tree), summary));
  container.append(root);

  function loadDraft() {
    const current = context.store.read();
    if ((Object.values(current.data).some(records => records.length) || current.scope.regionId || current.scope.years.length || current.title !== '未命名情景项目') && !confirm('切换到京津冀草案会替换当前项目。请先在项目页下载需要保留的备份。继续吗？')) return;
    const draft = createJJJDraftProject();
    draft.view = current.view;
    expanded.clear();
    draft.data.taxonomy.filter(node => !node.parentIds.length).forEach(node => expanded.add(node.id));
    expanded.add('jjj-group-0-section-0');
    const result = context.actions.replaceProject(draft);
    message.textContent = result.ok ? '已载入旧版已有描述符草案；状态阈值、角色和依据仍需核对。' : result.error.message;
  }

  function commit(ids) {
    const result = context.actions.selectElements(resolveSelection(context.store.read(), ids));
    if (!result.ok) {
      message.textContent = '选择未保存：' + result.error.message + '。' + result.error.recoveryAction;
      render();
      return;
    }
    message.textContent = context.persistenceState().ok ? '选择已保存。' : '选择已更新到当前页面；浏览器保存失败，请下载项目备份。';
  }
  function source(record, project, expert) {
    const evidence = record.evidenceRefs.map(id => project.data.evidence.find(item => item.id === id)).filter(Boolean);
    const origins = { fixture: '软件机制示例', import: '已有资料导入', user: '用户编辑', ai: 'AI草案' };
    const kinds = { fixture: '软件机制示例', 'user-assumption': '用户假设或草案', policy: '政策原文', paper: '文献', 'historical-data': '历史数据', expert: '专家判断' };
    return el('details', {}, el('summary', {}, '来源与依据'),
      el('p', {}, '记录来源：' + origins[record.provenance.origin] + '；版本 ' + record.version),
      expert ? el('p', {}, '稳定 ID：' + record.id + '；来源定位：' + (record.provenance.locator || '未提供')) : null,
      evidence.length ? evidence.map(item => el('p', {}, (kinds[item.kind] || item.kind) + (expert ? ' · ' + item.sourceId + ' · ' + item.locator : '') + '：' + item.excerpt)) : el('p', {}, '未关联依据，需补充来源。'));
  }
  function render() {
    if (disposed) return;
    const focused = tree.contains(document.activeElement) ? document.activeElement : null;
    const focusPath = focused?.closest('[data-path]')?.dataset.path;
    const focusTag = focused?.tagName;
    const p = context.store.read(), expert = p.view.perspective === 'expert';
    root.classList.toggle('is-expert', expert);
    search.placeholder = expert ? '搜索分类名称或稳定 ID' : '搜索你关注的因素';
    const selected = new Set(p.selection.nodeIds);
    const empty = !p.data.taxonomy.length;
    catalog.replaceChildren();
    if (empty) {
      catalog.append(el('h3', {}, '从已有框架开始'), el('p', { class: 'muted' }, '当前项目还没有分类。旧平台的24项描述符可以直接载入为草案，下面先展示已有内容。'),
        el('div', { class: 'elements-catalog-groups' }, ...JJJ_DRAFT_CATALOG.map(group => el('section', {}, el('strong', {}, group.label), el('p', {}, group.children.flatMap(section => section.descriptors.map(d => d.label)).join(' · '))))),
        el('button', { class: 'button', onclick: loadDraft }, '使用已有京津冀框架（24项）'), el('p', { class: 'muted' }, '保留原有三级结构，不补造第五、六级；不导入旧版评分或未核实的数值目标。'));
    } else {
      catalog.append(el('div', { class: 'elements-dataset' }, el('span', {}, p.title), el('span', { class: 'muted' }, p.data.descriptors.length + ' 项描述符'), el('button', { class: 'elements-inline', onclick: loadDraft }, '切换到京津冀草案')));
      if (p.data.descriptors.some(item => item.provenance.sourceId === 'legacy-framework')) catalog.append(el('p', { class: 'muted elements-draft-note' }, '旧版已有框架草案：保留原三级分类及状态名称，阈值、变量角色与依据尚未重新核验。'));
    }
    clear.disabled = !selected.size && !p.selection.descriptorIds.length;
    tree.replaceChildren();
    summary.replaceChildren(el('h3', {}, '所选分类（' + selected.size + '）'));
    if (!p.data.taxonomy.length) tree.append(el('p', {}, '当前没有分类数据。'), el('button', { class: 'button secondary', onclick: () => context.navigate('workspace') }, '返回项目页载入机制示例'));
    const rows = visibleRows(p.data.taxonomy, expanded, query);
    treeInfo.textContent = empty ? '等待载入分类' : (query.trim() ? '搜索结果与上级路径' : '分类目录') + ' · ' + rows.length + ' 行可见 / ' + p.data.taxonomy.length + ' 个节点';
    if (p.data.taxonomy.length && !rows.length) tree.append(el('p', {}, '没有匹配分类，请修改搜索词。'));
    for (const { node, depth, key } of rows) {
      const checkbox = el('input', { type: 'checkbox', 'data-node': node.id, onchange: event => {
        const ids = new Set(context.store.read().selection.nodeIds);
        if (event.target.checked) ids.add(node.id); else ids.delete(node.id);
        commit([...ids]);
      } });
      checkbox.checked = selected.has(node.id);
      const pathLabels = JSON.parse(key).map(id => p.data.taxonomy.find(item => item.id === id).label).join(' / ');
      const open = !!query.trim() || expanded.has(node.id);
      tree.append(el('div', { class: 'elements-row' + (depth === 1 ? ' is-root' : '') + (selected.has(node.id) ? ' is-selected' : ''), 'data-path': key, 'data-depth': depth, title: pathLabels, style: '--tree-indent:' + Math.min(depth - 1, 6) * 14 + 'px' },
        node.childIds.length ? el('button', { class: 'elements-disclosure', 'aria-label': (expanded.has(node.id) ? '收起 ' : '展开 ') + node.label, 'aria-expanded': String(open), disabled: !!query.trim(), onclick: () => {
          if (expanded.has(node.id)) expanded.delete(node.id); else expanded.add(node.id);
          render();
        } }, disclosure(open)) : el('span', { class: 'elements-leaf', 'aria-hidden': 'true' }),
        el('label', {}, checkbox, el('span', {}, node.label)),
        el('span', { class: 'elements-level' }, depth + '级'), expert ? el('span', { class: 'elements-node-id muted' }, node.id) : null));
    }
    for (const id of selected) {
      const node = p.data.taxonomy.find(item => item.id === id);
      if (!node) continue;
      const trails = visibleRows(p.data.taxonomy, new Set(p.data.taxonomy.map(item => item.id))).filter(row => row.node.id === id).map(row => JSON.parse(row.key).slice(0, -1).map(parentId => p.data.taxonomy.find(item => item.id === parentId).label).join(' / ')).filter(Boolean);
      summary.append(el('article', {}, el('div', { class: 'elements-selection-head' }, el('strong', {}, node.descriptorIds.length === 1 ? el('span', { class: 'variable-mark', 'aria-hidden': 'true', style: '--variable-color:' + variableColor(node.descriptorIds[0]) }) : null, node.label), el('button', { class: 'elements-inline', 'aria-label': '移除分类 ' + node.label, onclick: () => commit(p.selection.nodeIds.filter(value => value !== id)) }, '移除')),
        trails.length ? el('p', { class: 'elements-parent' }, '路径：' + trails.join('；')) : null,
        el('p', {}, node.descriptorIds.length ? (expert ? '直接映射：' : '研究因素：') + node.descriptorIds.map(id => p.data.descriptors.find(d => d.id === id)?.label || id).join('、') : '待配置：该分类还没有对应的计算变量。'),
        source(node, p, expert)));
    }
    if (!selected.size) summary.append(el('p', {}, '尚未选择分类。'));
    summary.append(el('h3', {}, '实际计算变量（' + p.selection.descriptorIds.length + '）'));
    for (const id of p.selection.descriptorIds) {
      const descriptor = p.data.descriptors.find(item => item.id === id);
      if (!descriptor) continue;
      const states = descriptor.stateIds.map(id => p.data.states.find(item => item.id === id)).filter(Boolean);
      summary.append(el('article', {}, el('strong', {}, el('span', { class: 'variable-mark', 'aria-hidden': 'true', style: '--variable-color:' + variableColor(descriptor.id) }), descriptor.label),
        el('p', {}, '映射分类：' + p.data.taxonomy.filter(node => selected.has(node.id) && node.descriptorIds.includes(id)).map(node => node.label).join('、')),
        el('p', {}, states.length ? '状态：' + states.map(state => state.label).join('、') : '缺口：该变量尚未定义状态，不能据此承诺可计算。'),
        expert ? el('p', {}, '角色：' + descriptor.role + '；状态 ID：' + descriptor.stateIds.join('、')) : null,
        source(descriptor, p, expert)));
    }
    if (focusPath) {
      const row = [...tree.children].find(item => item.dataset.path === focusPath);
      row?.querySelector(focusTag === 'INPUT' ? 'input' : 'button')?.focus();
    }
    summary.append(el('p', { class: 'muted' }, '此处仅确定研究输入，不代表已通过 CIB 检验。状态定义与影响依据需要分别核对。'));
  }
  search.addEventListener('input', () => { query = search.value; render(); });
  const unsubscribe = context.store.subscribe(render);
  render();
  return () => { disposed = true; unsubscribe(); root.remove(); };
}
