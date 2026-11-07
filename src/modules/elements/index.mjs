import {mount as mountTimeline} from '../timeline/index.mjs';
import {statePlanPanel} from './state-plan-panel.mjs';
import {definitionPanel} from './definition-panel.mjs';
import { el, openDrawer } from '../../core/ui.mjs';
import { resolveSelection, visibleRows, descendantChoices, toggleBranch } from './selection.mjs';
import { joinJJJFramework } from './framework.mjs';
import { JJJ_DRAFT_CATALOG, createJJJDraftProject } from '../../fixtures/jjj-draft.mjs';
import { variableColor } from '../../core/object-colors.mjs';
import {zonesOf, zoneCounts, taxonomyForZone} from './zones.mjs';
import {joinSocialFramework, SOCIAL_DIMENSIONS, SOCIAL_SOURCE} from '../../fixtures/social-framework.mjs';
import {ambitionPanel} from './ambition-panel.mjs';
import {clausesFor} from './policy-pilot.mjs';
import {joinBaseline, baselinePresence, descriptorNodeId} from './baseline.mjs';
import {LEGACY_MAP, MAPPING_CATEGORIES, mappingSummary, migrateSelection, MAPPING_SOURCE_NOTE} from '../../fixtures/legacy-map.mjs';
import {BASELINE_CATALOG_LABEL, BASELINE_STATE_SOURCE} from '../../fixtures/descriptors-46.mjs';
import {regionCoverage, coverageLabel, regionForScope, projectClauses} from '../map/geo.mjs';
import {toolsForDescriptor, libraryMeta, ROW as ROW_LIB} from '../map/library.mjs';

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
  let query = '', disposed = false, viewing = null, treeInitialized = false, inlineTime = null;
  let zoneFilter = 'all';
  // 切页返回时保留合理的展开状态与正在查看的因素：存会话级，随项目ID隔离；
  // 换项目不沿用旧对象（恢复值都要对当前 taxonomy/selection 校验后才使用）。
  const uiKey = 'elements-ui-v2:' + context.store.read().id;
  try {
    const savedUi = JSON.parse(sessionStorage.getItem(uiKey) || 'null');
    if (savedUi && typeof savedUi === 'object') {
      if (Array.isArray(savedUi.expanded)) savedUi.expanded.forEach(id => expanded.add(id));
      if (typeof savedUi.zoneFilter === 'string') zoneFilter = savedUi.zoneFilter;
      if (typeof savedUi.viewing === 'string') viewing = savedUi.viewing;
    }
  } catch { /* 状态保留失败不阻断页面 */ }
  const saveUI = () => { try { sessionStorage.setItem(uiKey, JSON.stringify({ expanded: [...expanded], zoneFilter, viewing })); } catch {} };
  const search = el('input', { type: 'search', id: 'elements-search', placeholder: '搜索名称或 ID', 'aria-label': '搜索描述符' });
  const tree = el('div', { class: 'elements-tree' });
  const summary = el('div', { class: 'elements-summary', 'aria-live': 'polite' });
  const message = el('p', { role: 'status' });
  const catalog = el('div', { class: 'elements-catalog' });
  const zoneBar=el('div',{class:'zone-bar','aria-label':'业务分区'});
  const frameworkBar=el('div',{class:'framework-bar','aria-label':'描述符框架'});
  const treeInfo = el('p', { class: 'elements-tree-info muted' });
  const regionStrip = el('div', { class: 'region-strip', 'aria-live': 'polite' });
  const clear = el('button', { class: 'button secondary', onclick: () => commit([]) }, '清空选择');
  // 先选框架、再选因素：框架条放在树上方，业务分区紧随其后。
  root.append(el('h2', { id: 'elements-title' }, '选择本次要研究的因素'),
    el('div', { class: 'elements-topbar' },
      el('div', { class: 'elements-picked', 'aria-live': 'polite', 'data-picked-count': '' }),
      el('div', { class: 'elements-searchrow' },
        search,
        el('button', { class: 'button text', type: 'button', onclick: () => commit([]) }, '清空'),
        el('button', { class: 'button text', type: 'button', onclick: () => { expanded.clear(); render(); } }, '收起全部'),
        el('button', { class: 'button secondary elements-starter', type: 'button', 'data-starter': '', onclick: startStarter }, '示例起点'))),
    message, regionStrip,
    frameworkBar, zoneBar,
    el('div', { class: 'elements-columns' }, el('section', { class: 'elements-browser', 'aria-label': '分类浏览' }, treeInfo, tree), summary),
    catalog);
  container.append(root);const editor=definitionPanel(root,context);const manage=el('details',{class:'factor-management is-major'},el('summary',{},'添加或修改因素定义'),editor.element);root.append(manage);

  function openDraftTree(){
    expanded.clear();context.store.read().data.taxonomy.filter(node=>!node.parentIds.length).forEach(node=>expanded.add(node.id));expanded.add('jjj-group-0-section-0');render();
  }
  function joinDraft(){
    try{const next=joinJJJFramework(context.store.read()),result=context.actions.replaceProject(next);if(!result.ok)throw new Error(result.error.message);openDraftTree();message.textContent=context.persistenceState().ok?'已向当前项目加入京津冀框架；项目名称、地区、年份与原有记录保留。':'框架已加入当前页面，但浏览器保存失败，请下载项目备份。';}
    catch(error){message.textContent=error.message;}
  }
  // 目录小样：与加入京津冀框架同一套原子语义。加入只新增目录、候选因素与三条摘要，
  // 不动项目身份、范围、既有定义、评分与选择；内容一致时重复加入不新增任何记录。
  function loadDraft() {
    const current = context.store.read();
    if (!confirm('新建京津冀示例项目会替换当前项目的名称、地区、年份、所有数据与选择。请先到项目页下载所需备份。继续替换吗？')) return;
    const draft = createJJJDraftProject();
    draft.scope={regionId:'京津冀',years:[2030,2035]};
    draft.id=crypto.randomUUID();
    draft.view = current.view;
    expanded.clear();
    draft.data.taxonomy.filter(node => !node.parentIds.length).forEach(node => expanded.add(node.id));
    expanded.add('jjj-group-0-section-0');
    const result = context.actions.replaceProject(draft);
    message.textContent = result.ok ? '已载入旧版已有描述符草案；状态阈值、角色和依据仍需核对。' : result.error.message;
    if(result.ok)openDraftTree();
  }

  function renderZones(p){
    if(!p.data.taxonomy.length){zoneBar.replaceChildren();return;}
    const counts=zoneCounts(p);
    // 分区就是目录的顶层领域；只列有内容的，不给一排看着像坏了的 0。
    const chips=[{id:'all',label:'全部',hint:'不筛选',count:p.data.descriptors.length},
      ...zonesOf(p).filter(z=>(counts[z.id]||0)>0).map(z=>({...z,count:counts[z.id]||0}))];
    // 当前筛选的分区若已被滤掉，退回"全部"，避免树是空的却没选中任何分区。
    if(!chips.some(z=>z.id===zoneFilter))zoneFilter='all';
    zoneBar.replaceChildren(el('span',{class:'zone-cap'},'业务分区'),
      ...chips.map(z=>el('button',{class:'zone-chip'+(zoneFilter===z.id?' is-on':''),'aria-pressed':String(zoneFilter===z.id),title:z.hint,onclick:()=>{zoneFilter=z.id;render();}},z.label,el('span',{class:'n'},String(z.count)))));
  }
  // 新项目默认带 46 项目录：用户确认过的体系，进因素页就能选。
  // 只载入目录与定义——不自动勾选因素，不伪造年度状态或评分。
  // 仅当项目真的什么都没有时才动（旧项目、自定义项目不受影响）。
  function autoJoinBaseline(){
    const p=context.store.read();
    if(p.data.taxonomy.length||p.data.descriptors.length||p.data.judgments.length||p.data.paths.length)return;
    try{
      const joined=joinBaseline(p),result=context.actions.replaceProject(joined.project);
      if(!result.ok)return;
      ['d46-g01','d46-g01-s01','d46-g01-s01-n01','d46-g02','d46-g03'].forEach(id=>expanded.add(id));
    }catch{/* 自动载入失败不阻断页面；空态里有手动入口。 */}
  }
  autoJoinBaseline();

  function joinBaselineNow(){
    try{
      const joined=joinBaseline(context.store.read()),result=context.actions.replaceProject(joined.project);
      if(!result.ok)throw new Error(result.error.message);
      expanded.clear();
      ['d46-g01','d46-g01-s01','d46-g01-s01-n01','d46-g02','d46-g03'].forEach(id=>expanded.add(id));
      render();
      message.textContent=context.persistenceState().ok
        ? '已加入《'+BASELINE_CATALOG_LABEL+'》：10 个领域、'+joined.counts.leaves+' 项具体描述符（另 2 项结果指标单列）。分类已确认；状态与评分尚未核定。'
        : '目录已加入当前页面，但浏览器保存失败，请下载项目备份。';
    }catch(error){message.textContent='目录未加入：'+error.message;}
  }
  function renderRegionStrip(p){
    const scope=p.scope.regionId||null;
    const region=regionForScope(scope);
    const picked=p.selection.descriptorIds.length;
    if(!scope){regionStrip.replaceChildren(el('span',{},'研究地区：未设置'),el('span',{class:'region-picked'},picked?'已选 '+picked+' 个因素':'还没选因素'),el('button',{class:'button text',type:'button',onclick:()=>context.navigate('workspace')},'去地图选地区'));return;}
    const coverage=regionCoverage(p,scope);
    // 长内容放右侧抽屉：按钮上带数量，点开才占屏；关闭后回到原位置，草稿与滚动不受影响。
    const material=el('button',{class:'button text region-material-btn',type:'button',onclick:event=>{
      openDrawer(event.currentTarget,'政策资料 · '+scope,body=>body.append(
        el('p',{},'导入文件：《'+(libraryMeta().source.file)+'》· 工作表「'+libraryMeta().source.sheet+'」· '+libraryMeta().source.received+' 收到；本页另计入 '+projectClauses(p,scope).length+' 条本项目自录条款。'),
        el('p',{},coverage.library+' 条工具记录（覆盖 '+coverage.docCount+' 份政策文件）属于「'+scope+'」；另有 '+coverage.national+' 条国家父工具不按地区计。'),
        el('p',{},'其中 '+coverage.matched+' 条工具记录已关联描述符（直接 '+coverage.direct+'／部分对应 '+coverage.partial+'），'+coverage.pending+' 条待匹配——待匹配不是没有关系，也不是评分为 0。'),
        el('p',{},'生效年份未知 '+coverage.yearsUnknown+' 条；已知不等于适用于 2030/2035，平台不做前向填充。'),
        el('p',{},'46 项描述符中 '+(coverage.covered||0)+' 项在本地有条款关联。'),
        el('p',{class:'v5-hint'},'另有 3 条天津交流稿摘要属于样例资料，不计入上述正式收录数。')));
    }},'查看政策资料（'+coverage.library+' 条）');
    regionStrip.replaceChildren(
      el('span',{},'研究地区'),el('b',{},scope+(region?'' : '（自定义）')),
      el('span',{class:'region-picked','data-picked-region':''},picked?'已选 '+picked+' 个因素':'还没选因素'),
      material,
      el('button',{class:'button text',type:'button',onclick:()=>context.navigate('workspace')},'换地区'));
  }
  function renderFrameworks(p){
    const hasSocial=p.data.descriptors.some(d=>d.provenance?.sourceId==='social-framework-lauer');
    const socialCount=p.data.descriptors.filter(d=>d.provenance?.sourceId==='social-framework-lauer').length;
    // 一张框架一行：名字 + 状态 + 行动作。副标题与说明不再单独占行。
    const card=(title,count,onJoin,note)=>el('div',{class:'fw-card'+(count?' is-in':'')},
      el('strong',{class:'fw-name'},title),
      el('span',{class:'v5-tag '+(count?'ok':'')},count?count+' 项已加入':'未加入'),
      note?el('span',{class:'fw-note'},note):null,
      el('button',{class:'button secondary fw-go',onclick:onJoin},count?'再次加入':'加入当前项目'));
    const openSocial=()=>{try{const joined=joinSocialFramework(context.store.read());const r=context.actions.replaceProject(joined);if(!r.ok)throw new Error(r.error.message);['social-root',...SOCIAL_DIMENSIONS.map(d=>'social-sec-'+d.id)].forEach(id=>expanded.add(id));render();message.textContent='已加入社会框架：'+(SOCIAL_DIMENSIONS.length)+' 个维度、'+p.data.taxonomy.filter(n=>n.id.startsWith('social-')).length+' 个节点。英文原词与出处随记录保留；变体是否穷尽、年份与阈值均未核定。';}catch(e){message.textContent='社会框架未加入：'+e.message;}};
    const base=baselinePresence(p);
    zoneBar.hidden=!p.data.taxonomy.length;
    frameworkBar.replaceChildren(
      card(BASELINE_CATALOG_LABEL,base.present?base.descriptors:0,joinBaselineNow,null),
      card('社会描述符框架',socialCount,openSocial,null));
  }
  // 选中描述符后的详情：完整分类路径、定义（如未建立就明说）、相关政策入口、细分缺口。
  // 口径：分类完成 ≠ 定义完成 ≠ 状态已核定，三件事分开说。
  function descriptorDetail(p,id){
    const descriptor=p.data.descriptors.find(d=>d.id===id);
    if(!descriptor)return null;
    const node=p.data.taxonomy.find(n=>n.descriptorIds.includes(id));
    let path='—';
    if(node){
      const chain=[];let cur=node;const guard=new Set();
      while(cur){if(guard.has(cur.id))break;guard.add(cur.id);chain.unshift(cur.label);cur=p.data.taxonomy.find(n=>n.id===(cur.parentIds&&cur.parentIds[0]));}
      path=chain.join(' → ');
    }
    const region=p.scope.regionId||'京津冀';
    const tools=toolsForDescriptor(region,id);
    const hasKids=p.data.taxonomy.some(n=>(n.parentIds||[]).includes(node?node.id:'__none__'));
    const detail=el('section',{class:'descriptor-detail','data-descriptor-detail':''},
      el('h3',{},descriptor.label+' · 详情'),
      el('p',{},el('span',{class:'dd-cap'},'分类路径'),path),
      descriptor.description?el('p',{},el('span',{class:'dd-cap'},'定义'),descriptor.description):null,
      el('p',{},el('span',{class:'dd-cap'},'相关政策'),
        el('button',{class:'button text',type:'button',onclick:event=>openDrawer(event.currentTarget,'相关政策 · '+descriptor.label,body=>{
          body.append(tools.length?el('div',{},...tools.map(row=>el('p',{class:'dd-tool'},
            el('b',{},row[ROW_LIB.path]),' · ',row[ROW_LIB.name]||row[ROW_LIB.doc],
            el('span',{class:'dd-note'},(row[ROW_LIB.start]?row[ROW_LIB.start]+' 年生效':'年份未知')+' · '+row[ROW_LIB.jurisdiction]))),
            null)
            :null);
        })},'查看政策（'+(tools.length?tools.length+' 条':'当地暂无')+'）')));
    return detail;
  }

  // 起步建议：46 项目录里唯一一对“两个方向都有参考规则”的因素，
  // 可以在不手填整张矩阵的前提下把机制跑通；它只是起点，不是政策结论。
  const STARTER = { descriptors: ['d46-20', 'd46-23'], label: '建筑能效要求 × 清洁取暖替代' };
  function startStarter(){
    const p=context.store.read();
    const nodes=STARTER.descriptors.map(id=>descriptorNodeId(p,id)).filter(Boolean);
    if(nodes.length<2){message.textContent='还没有加入 46 项目录，先加入目录再用示例起点。';return;}
    nodes.forEach(id=>{const node=p.data.taxonomy.find(n=>n.id===id);node?.parentIds.forEach(pid=>expanded.add(pid));expanded.add(id);});
    commit(nodes);
    message.textContent='已选「'+STARTER.label+'」：两个方向都有参考规则，可按年份选状态后一键填入。';
  }
  function commit(ids) {
    if(inlineTime&&!inlineTime.canLeave()){render();return;}
    const selection=resolveSelection(context.store.read(), ids);
    const added=selection.descriptorIds.filter(id=>!context.store.read().selection.descriptorIds.includes(id));
    if(added.length)viewing=added.at(-1);
    const result = context.actions.selectElements(selection);
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
    return el('button',{class:'button text source-btn',type:'button',onclick:event=>openDrawer(event.currentTarget,record.label?record.label+' · 来源与依据':'来源与依据',body=>{
      body.append(
        el('p', {}, '记录来源：' + origins[record.provenance.origin] + '；版本 ' + record.version),
        expert ? el('p', {}, '稳定 ID：' + record.id + '；来源定位：' + (record.provenance.locator || '未提供')) : null,
        evidence.length ? evidence.map(item => el('p', {}, (kinds[item.kind] || item.kind) + (expert ? ' · ' + item.sourceId + ' · ' + item.locator : '') + '：' + item.excerpt)) : el('p', {}, '未关联依据，需补充来源。'));
    })},'查看来源');
  }
  function render() {
    if (disposed) return;
    if(inlineTime?.hasPendingChanges())return;
    inlineTime?.dispose();inlineTime=null;
    const focused = tree.contains(document.activeElement) ? document.activeElement : null;
    const focusPath = focused?.closest('[data-path]')?.dataset.path;
    const focusTag = focused?.tagName;
    const focusWasName = !!focused?.classList?.contains('elements-name');
    const p = context.store.read(), expert = p.view.perspective === 'expert';
    if(!treeInitialized){const expandParents=id=>{const node=p.data.taxonomy.find(n=>n.id===id);if(!node||expanded.has(id))return;expanded.add(id);node.parentIds.forEach(expandParents);};p.data.taxonomy.filter(n=>!n.parentIds.length||n.descriptorIds?.some(id=>p.selection.descriptorIds.includes(id))).forEach(n=>expandParents(n.id));treeInitialized=true;}
    root.classList.toggle('is-expert', expert);
    search.placeholder = expert ? '搜索分类名称或稳定 ID' : '搜索你关注的因素';
    const selected = new Set(p.selection.nodeIds);
    const empty = !p.data.taxonomy.length;
    catalog.replaceChildren();
    renderZones(p);renderFrameworks(p);renderRegionStrip(p);
    root.querySelector('.demo-default-scope')?.remove();
    if(p.scope.regionId!=='京津冀'||JSON.stringify(p.scope.years)!=='[2030,2035]'){
      const demoBtn=el('button',{class:'button secondary demo-default-scope',onclick:()=>{if(inlineTime&&!inlineTime.canLeave())return;const result=context.actions.updateProjectDetails({title:p.title,scope:{regionId:'京津冀',years:[2030,2035]}});if(!result.ok)context.notify(result.error.message);}},'切换为演示范围：京津冀 · 2030 / 2035');
      if(regionStrip.parentNode===root)root.insertBefore(demoBtn,regionStrip);else root.append(demoBtn);
    }
    if (empty) {
      catalog.append(el('h3', {}, '从已有框架开始'),         el('div', { class: 'elements-catalog-groups' }, ...JJJ_DRAFT_CATALOG.map(group => el('section', {}, el('strong', {}, group.label), el('p', {}, group.children.flatMap(section => section.descriptors.map(d => d.label)).join(' · '))))),
        el('button', { class: 'button', onclick: joinDraft }, '向当前项目加入京津冀框架'));
    } else if (p.data.descriptors.some(item => item.provenance.sourceId === 'legacy-framework')) catalog.append();
    catalog.append(el('button',{class:'button secondary elements-new-demo',type:'button',onclick:loadDraft},'另建示例项目（替换当前项目）'));
    clear.disabled = !selected.size && !p.selection.descriptorIds.length;
    tree.replaceChildren();
    summary.replaceChildren(el('h3', {}, '所选分类（' + selected.size + '）'));
    if (!p.data.taxonomy.length) tree.append(
      el('div', { class: 'tree-empty' },
        el('p', {}, '当前项目还没有描述符目录（自动载入没有成功）。'),
        el('button', { class: 'button primary-action', type: 'button', 'data-join-baseline': '', onclick: joinBaselineNow }, '重新加入 46 项描述符目录（10 个领域）'),
        el('p', { class: 'v5-hint' }, '分类已确认；状态为平台参考设定，阈值与依据未核定。')));
    const zoneView=p.data.taxonomy.length?taxonomyForZone(p,zoneFilter):[];
    const rows = visibleRows(zoneView, expanded, query);
    // 只在搜索时给一句结果提示；平时不打印行数/节点数这类内部统计。
    treeInfo.textContent = query.trim() ? '搜索「' + query.trim() + '」：' + rows.length + ' 项匹配（含上级路径）' : '';
    treeInfo.hidden = !treeInfo.textContent;
    const pickedEl = root.querySelector('[data-picked-count]');
    if (pickedEl) pickedEl.textContent = p.selection.descriptorIds.length ? '已选 ' + p.selection.descriptorIds.length + ' 个因素' : '还没选因素';
    if (p.data.taxonomy.length && !rows.length) tree.append(el('p', {}, '没有匹配分类，请修改搜索词。'));
    for (const { node, depth, key } of rows) {
      const descendants=descendantChoices(p,node.id).descendantIds;
      const leaves=descendants.filter(id=>!p.data.taxonomy.find(n=>n.id===id)?.childIds.length);
      const branchChecked=node.childIds.length?leaves.length>0&&leaves.every(id=>selected.has(id))&&(!node.descriptorIds.length||selected.has(node.id)):selected.has(node.id);
      // 复选框只负责选择；展开/收起由箭头和整个名称区域负责，两件事互不误触。
      const checkbox = el('input', { type: 'checkbox', 'data-node': node.id, 'aria-label': (branchChecked?'已选中：':'选择 ')+node.label, onchange: event => {
        if(inlineTime&&!inlineTime.canLeave()){event.target.checked=branchChecked;return;}
        const ids=toggleBranch(context.store.read(),context.store.read().selection.nodeIds,node.id,event.target.checked);
        if(event.target.checked){const visited=new Set();const visit=id=>{if(visited.has(id))return;visited.add(id);expanded.add(id);p.data.taxonomy.find(n=>n.id===id)?.childIds.forEach(visit);};visit(node.id);}
        commit(ids);
      } });
      checkbox.checked = branchChecked;
      checkbox.indeterminate=!branchChecked&&(selected.has(node.id)||descendants.some(id=>selected.has(id)));
      const pathLabels = JSON.parse(key).map(id => p.data.taxonomy.find(item => item.id === id).label).join(' / ');
      const open = !!query.trim() || expanded.has(node.id);
      const toggleOpen = () => { if (expanded.has(node.id)) expanded.delete(node.id); else expanded.add(node.id); render(); };
      const isBranch = node.childIds.length > 0;
      // 名称区域：分支行是按钮（点击/键盘都能展开收起）。
      // 叶子行不用原生 label —— label 会自动触发一次复选框，再叠上行点击就变成"切两次"，
      // 表现为点名称反选、点空白取消不掉。这里改成普通容器，勾选统一由行的点击处理。
      const nameArea = isBranch
        ? el('button', { class: 'elements-name', type: 'button', 'aria-expanded': String(open), 'aria-label': (open?'收起（不改变选择）：':'展开（不改变选择）：')+node.label, onclick: toggleOpen }, node.label)
        : el('span', { class: 'elements-name-label' }, el('span', { class: 'elements-name' }, node.label));
      const rowChildren = [
        isBranch
          ? el('button', { class: 'elements-disclosure', 'aria-label': (expanded.has(node.id) ? '收起 ' : '展开 ') + node.label, 'aria-expanded': String(open), disabled: !!query.trim(), onclick: toggleOpen }, disclosure(open))
          : el('span', { class: 'elements-leaf', 'aria-hidden': 'true' }),
        el('div', { class: 'elements-cell' }, nameArea, checkbox),
        null
      ];
      const row = el('div', { class: 'elements-row' + (depth === 1 ? ' is-root' : '') + (selected.has(node.id) ? ' is-selected' : ''), 'data-path': key, 'data-depth': depth, title: pathLabels, style: '--tree-indent:' + Math.min(depth - 1, 6) * 14 + 'px' }, ...rowChildren);
      // 树叶行：整行一次点击 = 切换勾选。复选框本身交给它自己的 change，
      // 行点击跳过复选框，避免同一动作触发两次。
      if (!isBranch) {
        row.classList.add('is-pickable');
        row.addEventListener('click', event => {
          if (event.target.closest('input,button,select,a')) return;
          if (inlineTime && !inlineTime.canLeave()) return;
          checkbox.checked = !checkbox.checked;
          checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        });
      }
      tree.append(row);
    }
    for (const id of selected) {
      const node = p.data.taxonomy.find(item => item.id === id);
      if (!node) continue;
      const trails = visibleRows(p.data.taxonomy, new Set(p.data.taxonomy.map(item => item.id))).filter(row => row.node.id === id).map(row => JSON.parse(row.key).slice(0, -1).map(parentId => p.data.taxonomy.find(item => item.id === parentId).label).join(' / ')).filter(Boolean);
      const item=el('article', {}, el('div', { class: 'elements-selection-head' }, el('strong', {}, node.descriptorIds.length === 1 ? el('span', { class: 'variable-mark', 'aria-hidden': 'true', style: '--variable-color:' + variableColor(node.descriptorIds[0]) }) : null, node.label), el('button', { class: 'elements-inline', 'aria-label': '移除分类 ' + node.label, onclick: () => commit(p.selection.nodeIds.filter(value => value !== id)) }, '移除')),
        trails.length ? el('p', { class: 'elements-parent' }, '路径：' + trails.join('；')) : null,
        el('p', {}, node.descriptorIds.length ? (expert ? '直接映射：' : '研究因素：') + node.descriptorIds.map(id => p.data.descriptors.find(d => d.id === id)?.label || id).join('、') : '待配置：该分类还没有对应的计算变量。'),
        source(node, p, expert));
      if(!node.descriptorIds.length){
        const choices=descendantChoices(p,id);
        item.append(el('p',{},'这里只保留关注范围，不作为聚合变量计算。'),el('button',{class:'button secondary','aria-label':'定位下级因素 '+node.label,onclick:()=>{query='';search.value='';const all=visibleRows(p.data.taxonomy,new Set(p.data.taxonomy.map(n=>n.id))),path=all.find(r=>r.node.id===id);if(path)JSON.parse(path.key).forEach(n=>expanded.add(n));expanded.add(id);choices.descendantIds.forEach(n=>expanded.add(n));render();const target=choices.nodeIds[0]||id;const input=[...tree.querySelectorAll('[data-node]')].find(e=>e.dataset.node===target);input?.focus();input?.scrollIntoView({block:'nearest'});}},'展开并定位具体因素'));
        if(choices.nodeIds.length)item.append(el('p',{},'可选择的下级已有变量：'+choices.descriptorIds.map(d=>p.data.descriptors.find(x=>x.id===d).label).join('、')+'。状态名称存在不代表阈值/依据已核验。'),el('button',{class:'button','aria-label':'选择下级已有变量 '+node.label,onclick:()=>commit([...p.selection.nodeIds,...choices.nodeIds])},'选择下级已有变量（不是聚合）'));
        else item.append(el('p',{},'下级尚无同时具备变量映射和状态定义的因素，当前不能参与计算。可使用本页定义编辑入口建立因素并绑定分类，或恢复包含合法定义的备份。'),el('button',{class:'button secondary',onclick:()=>context.navigate('workspace')},'返回项目页恢复定义备份'));
      }
      summary.append(item);
    }
    if (!selected.size) summary.append(el('p', {}, '尚未选择分类。'));
    summary.append(el('h3', {}, '实际计算变量（' + p.selection.descriptorIds.length + '）'));
    for (const id of p.selection.descriptorIds) {
      const descriptor = p.data.descriptors.find(item => item.id === id);
      if (!descriptor) continue;
      const states = descriptor.stateIds.map(id => p.data.states.find(item => item.id === id)).filter(Boolean);
      const clauses = clausesFor(p, descriptor.id);
      const localTools = toolsForDescriptor(p.scope.regionId || '', descriptor.id);
      const hasLocal = localTools.length > 0;
      summary.append(el('article', { class: clauses.length ? 'elements-factor-detail' : '' }, el('strong', {}, el('span', { class: 'variable-mark', 'aria-hidden': 'true', style: '--variable-color:' + variableColor(descriptor.id) }), descriptor.label),
        el('p', {}, '映射分类：' + p.data.taxonomy.filter(node => selected.has(node.id) && node.descriptorIds.includes(id)).map(node => node.label).join('、'),
          ' ', el('span', { class: 'coverage-tag' + (hasLocal ? ' has' : '') }, hasLocal ? '当地条款 ' + localTools.length + ' 条' : '当地暂无条款')),
        descriptor.role === 'outcome' ? el('p', { class: 'v5-hint' }, '结果指标：不计入 46 项，默认不作为政策输入；选中它只用于观察结果。') : null,
        el('p', {}, states.length ? '状态：' + states.map(state => state.label).join('、') : '缺口：该变量尚未定义状态，不能据此承诺可计算。'),
        clauses.length ? el('section', { class: 'elements-clauses', 'aria-label': '候选因素的政策摘要' },
          el('p', { class: 'muted' }, '交流稿摘要，原条款待核 —— 三条政策指向同一候选因素；编号原样保留。'),
          el('ul', {}, ...clauses.map(clause => el('li', {}, el('strong', {}, clause.clauseId), '：', clause.excerpt, clause.note ? el('span', { class: 'elements-clause-note muted' }, clause.note) : null))),
          el('p', { class: 'elements-status-gap' }, '状态待定义：该候选因素尚无状态，' + (expert ? '参数、单位、年份与地区亦未映射。' : '暂不能参与检算。')),
          el('p', { class: 'muted' }, '政策摘要只用于追踪来源；关系评分依据继续独立。')) : null,
        expert ? el('p', {}, '角色：' + descriptor.role + '；状态 ID：' + descriptor.stateIds.join('、')) : null,
        source(descriptor, p, expert)));
    }
    if (focusPath) {
      const row = [...tree.children].find(item => item.dataset.path === focusPath);
      if (row) {
        const target = focusWasName ? row.querySelector('button.elements-name')
          : focusTag === 'INPUT' ? row.querySelector('input')
          : row.querySelector('button.elements-disclosure') || row.querySelector('button');
        target?.focus();
      }
    }
    const notes=el('details',{},el('summary',{},'所选因素、状态与出处'),...summary.childNodes);
    summary.replaceChildren();
    const ids=p.selection.descriptorIds; if(!ids.includes(viewing))viewing=ids.find(id=>p.data.paths.some(path=>path.descriptorId===id))||ids.at(-1)||null;
    const switchViewing=id=>{if(!inlineTime||inlineTime.canLeave()){viewing=id;saveUI();render();}};
    // 已选因素较多时不无限横排：可搜索的“当前编辑因素”+上一项/下一项；切换只换查看对象，不动勾选、状态或评分。
    if(ids.length>6){
      const listId='factor-search-list-'+p.id.replace(/[^a-z0-9-]/gi,'');
      const input=el('input',{type:'search',class:'factor-search',list:listId,placeholder:'输入名称筛选并选择','aria-label':'搜索并选择当前编辑因素'});
      input.addEventListener('change',()=>{
        const value=input.value.trim();
        const hit=p.data.descriptors.find(d=>d.label===value||d.id===value&&ids.includes(d.id));
        if(hit&&ids.includes(hit.id))switchViewing(hit.id);
        else if(value)message.textContent='没有匹配的已选因素：'+value+'。请从列表中选择。';
        input.value='';
      });
      const index=()=>Math.max(0,ids.indexOf(viewing));
      summary.append(el('div',{class:'factor-picker'},
        el('label',{class:'factor-picker-search'},'当前编辑因素（已选 '+ids.length+' 个）',input,
          el('datalist',{id:listId},...ids.map(id=>el('option',{value:p.data.descriptors.find(d=>d.id===id)?.label||id})))),
        el('div',{class:'factor-picker-nav'},
          el('button',{class:'button text',type:'button',onclick:()=>switchViewing(ids[(index()-1+ids.length)%ids.length])},'上一项'),
          el('button',{class:'button text',type:'button',onclick:()=>switchViewing(ids[(index()+1)%ids.length])},'下一项'))));
    }
    else if(ids.length){summary.append(el('div',{class:'preview-switch'},...ids.map(id=>el('button',{class:'button'+(id===viewing?' selected':''),onclick:()=>switchViewing(id)},p.data.descriptors.find(d=>d.id===id)?.label||id))));}
    const timeHost=el('section',{class:'factor-time-editor','aria-label':'因素年份变化'});
    if(viewing){
      const detail=descriptorDetail(p,viewing);
      if(detail)summary.append(detail);
      summary.append(statePlanPanel(p,viewing,context,()=>!inlineTime||inlineTime.canLeave()));
      summary.append(ambitionPanel(p,viewing,context,render));
      const advanced=el('details',{class:'numeric-time-options'},el('summary',{},'需要填写具体数值？展开高级设置'),timeHost);
      advanced.addEventListener('toggle',()=>{if(!advanced.isConnected)return;if(advanced.open&&!inlineTime)inlineTime=mountTimeline(timeHost,{...context,inlineTimeline:{descriptorId:viewing}});else if(!advanced.open&&inlineTime){if(!inlineTime.canLeave()){advanced.open=true;return;}inlineTime.dispose();inlineTime=null;}});
      summary.append(advanced);
    }
    else summary.append(el('p',{},'勾选一个具体因素后，在这里填写年份变化。'));
    summary.append(notes);
    saveUI();
  }
  search.addEventListener('input', () => { query = search.value; render(); });
  const unsubscribe = context.store.subscribe(render);
  render();
  return {canLeave(){return editor.canLeave()&&(!inlineTime||inlineTime.canLeave());},dispose(){disposed=true;unsubscribe();inlineTime?.dispose();editor.dispose();root.remove();}};
}
