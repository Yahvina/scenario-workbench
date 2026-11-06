import {mount as mountTimeline} from '../timeline/index.mjs';
import {statePlanPanel} from './state-plan-panel.mjs';
import {definitionPanel} from './definition-panel.mjs';
import { el, openDrawer } from '../../core/ui.mjs';
import { resolveSelection, visibleRows, descendantChoices, toggleBranch } from './selection.mjs';
import { joinJJJFramework } from './framework.mjs';
import { JJJ_DRAFT_CATALOG, createJJJDraftProject } from '../../fixtures/jjj-draft.mjs';
import { variableColor } from '../../core/object-colors.mjs';
import {ZONES, zoneCounts, taxonomyForZone} from './zones.mjs';
import {joinSocialFramework, SOCIAL_DIMENSIONS, SOCIAL_SOURCE} from '../../fixtures/social-framework.mjs';
import {ambitionPanel} from './ambition-panel.mjs';
import {POLICY_PILOT_PATH, POLICY_PILOT_CLAUSES, POLICY_PILOT_GAPS, POLICY_PILOT_SOURCE, POLICY_PILOT_DESCRIPTOR_ID, POLICY_PILOT_LEAF_ID, clausesFor, joinPolicyPilot} from './policy-pilot.mjs';
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
  const otherFrameworks=el('details',{class:'other-frameworks'},el('summary',{},'其他框架与示例'));
  const zoneBar=el('div',{class:'zone-bar','aria-label':'业务分区'});
  const frameworkBar=el('div',{class:'framework-bar','aria-label':'描述符框架'});
  const treeInfo = el('p', { class: 'elements-tree-info muted' });
  const regionStrip = el('div', { class: 'region-strip', 'aria-live': 'polite' });
  const clear = el('button', { class: 'button secondary', onclick: () => commit([]) }, '清空选择');
  // 框架来源是设置项，不是每天的活：默认收成一行，树和年份状态占据首屏。
  const frameworkBox=el('details',{class:'framework-box'});
  const frameworkSummary=el('summary',{},'框架与来源');
  let legacyBox=el('div',{class:'legacy-host'});
  // 业务分区是旧版视图，新体系按政策领域组织：能力保留，但收进「框架与来源」，不占首屏。
  frameworkBox.append(frameworkSummary,zoneBar,catalog,frameworkBar);
  root.append(el('h2', { id: 'elements-title' }, '选择本次要研究的因素'),
    el('div', { class: 'elements-topbar' },
      el('div', { class: 'elements-picked', 'aria-live': 'polite', 'data-picked-count': '' }),
      el('div', { class: 'elements-searchrow' },
        search,
        el('button', { class: 'button text', type: 'button', onclick: () => commit([]) }, '清空'),
        el('button', { class: 'button text', type: 'button', onclick: () => { expanded.clear(); render(); } }, '收起全部'),
        el('button', { class: 'button secondary elements-starter', type: 'button', 'data-starter': '', onclick: startStarter }, '示例起点'))),
    message, regionStrip,
    el('details', { class: 'elements-rules' }, el('summary', {}, '选择规则'),
      el('p', {}, '目录分三级：政策领域 → 细分领域 → 具体描述符。只有具体描述符参与计算，领域与细分只是分类。'),
      el('p', {}, '勾选上级会带选全部下级，取消同理；部分选中时上级显示半选。同一因素只计算一次。')),
    el('div', { class: 'elements-columns' }, el('section', { class: 'elements-browser', 'aria-label': '分类浏览' }, treeInfo, tree), summary), frameworkBox);
  container.append(root);const editor=definitionPanel(root,context);const manage=el('details',{class:'factor-management'},el('summary',{},'添加或修改因素定义'),editor.element);root.append(manage,otherFrameworks);

  function openDraftTree(){
    expanded.clear();context.store.read().data.taxonomy.filter(node=>!node.parentIds.length).forEach(node=>expanded.add(node.id));expanded.add('jjj-group-0-section-0');render();
  }
  function joinDraft(){
    try{const next=joinJJJFramework(context.store.read()),result=context.actions.replaceProject(next);if(!result.ok)throw new Error(result.error.message);openDraftTree();message.textContent=context.persistenceState().ok?'已向当前项目加入京津冀框架；项目名称、地区、年份与原有记录保留。':'框架已加入当前页面，但浏览器保存失败，请下载项目备份。';}
    catch(error){message.textContent=error.message;}
  }
  // 目录小样：与加入京津冀框架同一套原子语义。加入只新增目录、候选因素与三条摘要，
  // 不动项目身份、范围、既有定义、评分与选择；内容一致时重复加入不新增任何记录。
  const pilot = el('section', { class: 'elements-pilot', 'aria-labelledby': 'elements-pilot-title' });
  function joinPilot(){
    try{
      const joined = joinPolicyPilot(context.store.read()), result = context.actions.replaceProject(joined.project);
      if (!result.ok) throw new Error(result.error.message);
      ['pilot-node-domain', 'pilot-node-sector', 'pilot-node-measure', POLICY_PILOT_LEAF_ID].forEach(id => expanded.add(id));
      render();
      if (!context.persistenceState().ok) message.textContent = '目录小样已加入当前页面，但浏览器保存失败，请下载项目备份。';
      else if (joined.added) message.textContent = '已向当前项目加入目录小样：项目名称、地区、年份与原有定义、评分、选择保留。';
      else message.textContent = '目录小样已在当前项目中且内容一致，未新增节点或记录。';
    }
    catch(error){ message.textContent = error.message; }
  }
  function renderPilot(){
    const p = context.store.read(), joined = p.data.taxonomy.some(node => node.id === POLICY_PILOT_LEAF_ID);
    const expert = p.view.perspective === 'expert';
    const rows = [
      el('h3', { id: 'elements-pilot-title' }, '目录小样：' + POLICY_PILOT_PATH.join(' → ')),
      el('ul', { class: 'elements-pilot-clauses' }, ...POLICY_PILOT_CLAUSES.map(clause =>
        el('li', {}, el('strong', {}, clause.clauseId), el('span', { class: 'elements-pilot-excerpt' }, clause.excerpt), null))),
      el('button', { class: 'button', type: 'button', onclick: joinPilot }, joined ? '再次加入目录小样（内容一致时不新增）' : '向当前项目加入目录小样')
    ];
    // replaceChildren 会把 null 转成文本 "null"：先过滤，只有 el() 的 children 会自行跳过 null。
    pilot.replaceChildren(...rows.filter(row => row !== null && row !== undefined));
  }
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
    const chips=[{id:'all',label:'全部',hint:'不筛选'} ,...ZONES];
    zoneBar.replaceChildren(el('span',{class:'zone-cap'},'业务分区'),
      ...chips.map(z=>el('button',{class:'zone-chip'+(zoneFilter===z.id?' is-on':''),'aria-pressed':String(zoneFilter===z.id),title:z.hint,onclick:()=>{zoneFilter=z.id;render();}},z.label,el('span',{class:'n'},String(z.id==='all'?p.data.descriptors.length:counts[z.id]||0)))));
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
  function renderLegacyMap(p){
    const summary=mappingSummary();
    const selectedLegacy=LEGACY_MAP.filter(row=>p.selection.descriptorIds.includes(row.legacy)).map(row=>row.label);
    const missingTargets=LEGACY_MAP.flatMap(row=>row.targets).filter(id=>!p.data.descriptors.some(d=>d.id===id));
    const box=el('details',{class:'legacy-map'},el('summary',{},'旧目录（24 项）→ 46 项对照与迁移'));
    const rows=LEGACY_MAP.map(row=>el('tr',{},
      el('td',{},row.label),
      el('td',{class:'rel rel-'+row.relation},(MAPPING_CATEGORIES.find(c=>c.id===row.relation)||{}).label||row.relation),
      el('td',{},row.outcome?'→ 结果指标（不计入 46 项）':row.targets.length?row.targets.map(id=>p.data.descriptors.find(d=>d.id===id)?.label||id).join('、'):'—'),
      el('td',{},row.note)));
    const migrate=el('button',{class:'button',type:'button',onclick:()=>{
      try{
        const plan=migrateSelection(context.store.read(),id=>descriptorNodeId(context.store.read(),id));
        if(!plan.descriptorIds.length){
          message.textContent='没有可迁移的旧选择：'+(plan.gaps.length?'所选旧项都属未匹配（'+plan.gaps.map(g=>g.label).join('、')+'）。':'当前没有选中旧目录的描述符。');
          return;
        }
        const next=migrateSelection(context.store.read(),id=>descriptorNodeId(context.store.read(),id));
        const merged=[...new Set([...context.store.read().selection.nodeIds,...next.nodeIds])];
        const selection={nodeIds:merged,descriptorIds:[...new Set([...context.store.read().selection.descriptorIds,...next.descriptorIds])],stateIds:context.store.read().selection.stateIds,lockedStateIds:context.store.read().selection.lockedStateIds};
        const result=context.actions.selectElements(selection);
        if(!result.ok)throw new Error(result.error.message);
        render();
        message.textContent='已迁移选择：新增 '+next.descriptorIds.length+' 项。'+next.notCarried+(plan.gaps.length?' 未迁移：'+plan.gaps.map(g=>g.label+'（'+g.reason+'）').join('；'):'')+(plan.unresolved.length?' 未解析：'+plan.unresolved.map(g=>g.label+'：'+g.reason).join('；'):'');
      }catch(error){message.textContent='迁移未完成：'+error.message;}
    }},'把当前旧选择迁移到 46 项');
    migrate.disabled=!selectedLegacy.length||!!missingTargets.length;
    box.append(
      el('p',{},selectedLegacy.length?'当前选中的旧描述符：'+selectedLegacy.join('、'):'当前没有选中旧目录的描述符。'),
      el('table',{},el('thead',{},el('tr',{},el('th',{},'旧描述符'),el('th',{},'关系'),el('th',{},'新体系对应'),el('th',{},'说明'))),el('tbody',{},...rows)),
      el('div',{class:'actions'},migrate));
    return box;
  }
  function renderFrameworks(p){
    const hasPolicy=p.data.descriptors.some(d=>d.provenance?.sourceId==='legacy-framework');
    const hasSocial=p.data.descriptors.some(d=>d.provenance?.sourceId==='social-framework-lauer');
    const policyCount=p.data.descriptors.filter(d=>d.provenance?.sourceId==='legacy-framework').length;
    const socialCount=p.data.descriptors.filter(d=>d.provenance?.sourceId==='social-framework-lauer').length;
    const card=(title,sub,count,onJoin,note)=>el('div',{class:'fw-card'+(count?' is-in':'')},
      el('div',{class:'fw-hd'},el('strong',{},title),el('span',{class:'v5-tag '+(count?'ok':'')},count?count+' 项已加入':'未加入')),
      el('p',{class:'v5-hint'},sub),
      note?el('p',{class:'v5-hint fw-note'},note):null,
      el('button',{class:'button secondary',onclick:onJoin},count?'再次加入（内容一致不新增）':'加入当前项目'));
    const openSocial=()=>{try{const joined=joinSocialFramework(context.store.read());const r=context.actions.replaceProject(joined);if(!r.ok)throw new Error(r.error.message);['social-root',...SOCIAL_DIMENSIONS.map(d=>'social-sec-'+d.id)].forEach(id=>expanded.add(id));render();message.textContent='已加入社会框架：'+(SOCIAL_DIMENSIONS.length)+' 个维度、'+p.data.taxonomy.filter(n=>n.id.startsWith('social-')).length+' 个节点。英文原词与出处随记录保留；变体是否穷尽、年份与阈值均未核定。';}catch(e){message.textContent='社会框架未加入：'+e.message;}};
    const base=baselinePresence(p);
    zoneBar.hidden=!p.data.taxonomy.length;
    frameworkSummary.textContent='框架与来源 · 46 项 '+(base.present?(base.descriptors+' / '+base.counts.leaves):'未加入')+' / 旧目录 '+(policyCount||'未加入')+' / 社会 '+(socialCount||'未加入');
    if(!p.data.descriptors.length)frameworkBox.open=true;
    frameworkBar.replaceChildren(
      card(BASELINE_CATALOG_LABEL,
        base.counts.domains+' 个领域 · '+base.counts.sections+' 个细分领域 · '+base.counts.leaves+' 项描述符 · '+base.counts.outcomes+' 项结果指标',
        base.present?base.descriptors:0,joinBaselineNow,
        null),
      card('社会描述符框架',SOCIAL_DIMENSIONS.length+' 个维度',socialCount,openSocial,null));
    // 旧 24 项 + 迁移工具收进默认折叠的二级分组，不与新目录抢首屏。
    const legacyCard=card('旧版 24 项目录','6 个分组 · 24 个因素',policyCount,joinDraft,null);
    const legacyWrap=el('details',{class:'fw-legacy'},el('summary',{},'旧项目兼容与迁移（24 项旧目录 → 46 项）'),legacyCard);
    const freshLegacy=renderLegacyMap(p);
    legacyWrap.append(freshLegacy);
    if(legacyBox.isConnected)legacyBox.replaceWith(legacyWrap);else frameworkBox.append(legacyWrap);
    legacyBox=legacyWrap;
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
    // 目录始终留在「框架与来源」里；空态时该折叠会自动展开，不再把节点搬到 root（搬动会踩到不是直接子节点的锚点）。
    if(!empty)otherFrameworks.append(catalog);
    otherFrameworks.hidden=empty;
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
    } else {
      catalog.append(el('div', { class: 'elements-dataset' }, el('span', {}, p.title), el('span', { class: 'muted' }, p.data.descriptors.length + ' 项描述符')));
      if (p.data.descriptors.some(item => item.provenance.sourceId === 'legacy-framework')) catalog.append();
    }
    catalog.append(el('details',{},el('summary',{},'另建示例项目（替换当前项目）'),el('p',{},'这会重设名称、范围、数据与选择，与“向当前项目加入框架”不同。'),el('button',{class:'button secondary',onclick:loadDraft},'新建京津冀示例项目（替换当前项目）')));
    if (!pilot.isConnected) root.append(el('details',{class:'pilot-library'},el('summary',{},'查看燃煤政策目录小样'),pilot));
    renderPilot();
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
      // 名称区域：分支行是按钮（点击/键盘都能展开收起），叶子行点击只选这个描述符，不会误选整类。
      const nameArea = isBranch
        ? el('button', { class: 'elements-name', type: 'button', 'aria-expanded': String(open), 'aria-label': (open?'收起（不改变选择）：':'展开（不改变选择）：')+node.label, onclick: toggleOpen }, node.label)
        : el('label', { class: 'elements-name-label' }, checkbox, el('span', { class: 'elements-name' }, node.label));
      const rowChildren = [
        isBranch
          ? el('button', { class: 'elements-disclosure', 'aria-label': (expanded.has(node.id) ? '收起 ' : '展开 ') + node.label, 'aria-expanded': String(open), disabled: !!query.trim(), onclick: toggleOpen }, disclosure(open))
          : el('span', { class: 'elements-leaf', 'aria-hidden': 'true' }),
        el('div', { class: 'elements-cell' }, nameArea, isBranch ? checkbox : null),
        null
      ];
      tree.append(el('div', { class: 'elements-row' + (depth === 1 ? ' is-root' : '') + (selected.has(node.id) ? ' is-selected' : ''), 'data-path': key, 'data-depth': depth, title: pathLabels, style: '--tree-indent:' + Math.min(depth - 1, 6) * 14 + 'px' }, ...rowChildren));
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
