import { el } from '../../core/ui.mjs';
import { buildChain, CHAIN_STATUS } from './nodes.mjs';
import { readRunArchive } from '../solver/index.mjs';
import { readPlanChecks } from '../solver/plan-check-store.mjs';
import { gammaOf, tisOf } from '../../core/analytics.mjs';
import { planAtYear } from '../elements/state-plan.mjs';
import { explain } from '../solver/engine.mjs';

// 与 app.mjs 路由一致的可达模块；没接路由的节点不放假按钮。
const ROUTED = new Set(['workspace', 'elements', 'timeline', 'relationships', 'solver', 'exports', 'ai-draft', 'chain']);

export function mount(container, context) {
  const root = el('section', { class: 'chain-module' });
  container.append(root);
  // 默认只显示步骤清单与状态；点开某一步才看它的输入、依据与缺口。
  let open = new Set();
  let disposed = false;

  function render() {
    if (disposed) return;
    const p = context.store.read();
    const archive = readRunArchive(context.store);
    const fresh = archive ? context.store.isCurrent(archive.projectInputSnapshot) : false;
    const nodes = buildChain({ project: p, archive, fresh, storeCurrent: fresh, planChecks: readPlanChecks(p.id) });
    root.replaceChildren();

    const run = archive?.RunResult;
    root.append(el('div', { class: 'v5-head' },
        el('h1', {}, '计算过程与依据'),
      el('div', { class: 'head-actions' },
        el('button', { class: 'button secondary', onclick: () => context.navigate('methods') }, '看一般方法与公式'),
        el('button', { class: 'button secondary', onclick: () => render() }, '重新读取当前输入'))));

    // 解释对象必须写清：哪一份结果、哪一年、什么时候、有没有过期。
    const explainYear = archive?.RunInput?.year ?? null;
    const explainAt = run?.createdAt || null;
    const contextBar = el('div', { class: 'v5-card chain-context' }, el('div', { class: 'bd' },
      el('p', {}, '解释对象：' + p.title + ' · ' + (explainYear === null ? '尚未计算' : explainYear + ' 年检验结果')),
      el('div', { class: 'chain-context-actions' },
        archive ? el('button', { class: 'button', onclick: () => context.navigate('solver') }, '返回对应的检验结果') : el('button', { class: 'button', onclick: () => context.navigate('solver') }, '去检验与结果'),
        el('button', { class: 'button text', onclick: () => context.navigate('robustness') }, '稳健性检验'))));
    root.append(contextBar);

    root.append(el('div', { class: 'v5-steps' }, ...nodes.map((node, i) => {
      const done = node.status === 'ok';
      const cur = node.status === 'gap' || (node.status === 'empty' && nodes.slice(0, i).every(n => n.status === 'ok'));
      return el('span', { class: 'v5-step' + (done ? ' done' : cur ? ' cur' : '') },
        el('span', { class: 'n' }, done ? '✓' : String(node.no)), node.title);
    })));

    // 概要数字：全部来自当前输入与最新归档
    const judged = p.data.judgments.reduce((s, j) => s + (j.entries || []).length, 0);
    root.append(el('div', { class: 'v5-card chain-summary' }, el('div', { class: 'bd' },
      el('div', { class: 'chain-summary-grid' },
        stat(p.data.evidence.length, '条依据'),
        stat(p.selection.descriptorIds.length, '个因素'),
        stat(judged, '个状态对格子'),
        stat(run?.count ?? '—', '个自洽配置'),
        stat(run?.checked ?? '—', '个已检查配置')),
      )));

    const grid = el('div', { class: 'v5-grid' });
    const main = el('div', { class: 'v5-main' });
    for (const node of nodes) {
      const [label, cls] = CHAIN_STATUS[node.status] || ['未知', 'warn'];
      const card = el('article', { class: 'v5-card chain-node', 'data-chain-node': node.id, 'data-status': node.status });
      const head = el('button', { class: 'chain-node-hd', 'aria-expanded': String(open.has(node.id)), onclick: () => {
        if (open.has(node.id)) open.delete(node.id); else open.add(node.id);
        render();
      } },
        el('span', { class: 'chain-no' }, String(node.no)),
        el('span', { class: 'chain-title' }, node.title),
        el('span', { class: 'v5-tag ' + cls }, label),
        el('span', { class: 'chain-go' }, open.has(node.id) ? '收起' : '展开'));
      card.append(head);
      if (open.has(node.id)) {
        const body = el('div', { class: 'chain-node-bd' });
        body.append(el('dl', { class: 'chain-input' }, ...node.input.map(([k, v]) => el('div', {}, el('dt', {}, k), el('dd', {}, String(v))))));
        body.append(el('p', { class: 'chain-did' }, el('b', {}, '做了什么：'), node.did));
        body.append(el('ul', { class: 'chain-output' }, ...node.output.map(text => el('li', {}, text))));
        body.append(el('p', { class: 'chain-source' }, el('b', {}, '依据与版本：'), node.source));
        if (node.gaps?.length) body.append(el('ul', { class: 'chain-gaps' }, ...node.gaps.map(text => el('li', {}, text))));
        body.append(el('div', { class: 'chain-actions' },
          ROUTED.has(node.module)
            ? el('button', { class: 'button secondary', onclick: () => context.navigate(node.module) }, '去「' + moduleTitle(node.module) + '」')
            : el('span', { class: 'v5-hint' }, '「' + moduleTitle(node.module) + '」页面在后续包接入；这里先如实清点已有记录。')));
        if (node.id === 'solve') {
          if (run?.scenarios?.length) body.append(scenarioReverse(p, archive));
          else {
            // 刷新后全空间归档不再在会话里，但“检验我的方案”的记录还在：
            // 用它反查某一条评分，仍然指到具体的判断与矩阵原值。
            const records = Object.values(readPlanChecks(p.id)).filter(r => r?.trace?.balances?.length);
            records.sort((a, b) => String(b.at).localeCompare(String(a.at)));
            if (records[0]) body.append(planReverse(p, records[0]));
          }
        }
        card.append(body);
      }
      main.append(card);
    }
    grid.append(main);

    root.append(grid);
  }

  function scenarioReverse(p, archive) {
    const run = archive.RunResult;
    const name = id => p.data.descriptors.find(d => d.id === id)?.label || id;
    const stateName = id => p.data.states.find(s => s.id === id)?.label || id;
    const pick = el('select', { 'aria-label': '选一个自洽配置反查评分' }, ...run.scenarios.slice(0, 100).map((c, i) => el('option', { value: String(i) }, '配置 ' + (i + 1) + '：' + Object.values(c).map(stateName).join(' / '))));
    const out = el('div', { class: 'chain-reverse' });
    function paint() {
      const config = run.scenarios[Number(pick.value) || 0];
      const trace = explain(archive.RunInput, config);
      out.replaceChildren();
      const table = el('table', { class: 'v5-table' },
        el('thead', {}, el('tr', {}, el('th', {}, '因素'), el('th', {}, '所选'), el('th', {}, '所选支持'), el('th', {}, '最大支持'), el('th', {}, '差距'), el('th', {}, '来源判断'))));
      const body = el('tbody');
      for (const b of trace.balances) {
        const ids = [...new Set(b.candidates.flatMap(c => c.contributions.map(x => x.judgmentId)))];
        body.append(el('tr', {}, el('td', {}, name(b.descriptorId)), el('td', {}, stateName(b.selectedStateId)),
          el('td', { class: 'num' }, String(b.selectedSupport)), el('td', { class: 'num' }, String(b.maximum)),
          el('td', { class: 'num' }, String(b.gap)),
          el('td', {}, ids.filter(Boolean).join('、') || '—')));
      }
      table.append(body);
      out.append(table);
      const ev = archive.RunInput.matrix.evidenceRefs.map(id => p.data.evidence.find(e => e.id === id)).filter(Boolean);
      out.append();
    }
    pick.addEventListener('change', paint);
    paint();
    return el('details', { class: 'chain-detail' }, el('summary', {}, '从一条结果反查每一分的来源'), pick, out);
  }

  // 用「检验我的方案」的记录反查：每一分都指到那次检验用到的判断记录。
  function planReverse(p, record) {
    const name = id => p.data.descriptors.find(d => d.id === id)?.label || id;
    const stateName = id => p.data.states.find(s => s.id === id)?.label || id;
    const out = el('div', { class: 'chain-reverse' },
      el('p', { class: 'v5-hint' }, '全空间归档只保留在本次会话；下表来自 ' + record.year + ' 年方案检验记录（r' + record.projectRevision + '，' + new Date(record.at).toLocaleString() + '），每一行都能回到当时的判断记录。'));
    const table = el('table', { class: 'v5-table' },
      el('thead', {}, el('tr', {}, el('th', {}, '因素'), el('th', {}, '所选'), el('th', {}, '所选支持'), el('th', {}, '最大支持'), el('th', {}, '差距'), el('th', {}, '来源判断'))));
    const tbody = el('tbody');
    for (const b of record.trace.balances) {
      const ids = [...new Set((b.contributions || []).map(x => x.judgmentId).filter(Boolean))];
      tbody.append(el('tr', {}, el('td', {}, name(b.descriptorId)), el('td', {}, stateName(b.selectedStateId)),
        el('td', { class: 'num' }, String(b.selectedSupport)), el('td', { class: 'num' }, String(b.maximum)),
        el('td', { class: 'num' }, String(b.gap)), el('td', {}, ids.join('、') || '—')));
    }
    table.append(tbody);
    out.append(table);
    return el('details', { class: 'chain-detail', open: true }, el('summary', {}, '从方案检验记录反查每一分的来源'), out);
  }

  const unsubscribe = context.store.subscribe(render);
  render();
  return { dispose() { disposed = true; unsubscribe(); root.remove(); } };
}

function stat(value, label) {
  return el('div', { class: 'chain-stat' }, el('strong', {}, String(value)), el('span', {}, label));
}
function moduleTitle(module) {
  return { workspace: '项目与研究范围', elements: '因素与状态', timeline: '政策实施路径', relationships: '关系与依据', solver: '检验与解释', exports: '保存与导出', policy: '政策库', methods: '方法' }[module] || module;
}

export function formulaContext(p, archive) {
  const input = archive?.RunInput;
  const ctx = { input, run: archive?.RunResult || null };
  const name = id => p.data.descriptors.find(d => d.id === id)?.label || id;
  const stateName = id => p.data.states.find(s => s.id === id)?.label || id;
  if (input) {
    const plan = p.scope.years.includes(input.year) ? planAtYear(p, input.year) : null;
    if (plan?.complete) {
      try {
        ctx.trace = explain(input, plan.config);
        ctx.name = name;
        ctx.tis = tisOf(input, plan.config).sum;
        // support 卡的真实代入：取解释轨迹里第一个因素“所选状态”的支持分展开。
        const b = ctx.trace.balances[0];
        if (b) {
          const picked = b.candidates.find(c => c.stateId === b.selectedStateId);
          ctx.sample = {
            label: input.year + ' 年方案 · ' + ctx.name(b.descriptorId) + ' 取“' + stateName(b.selectedStateId) + '”',
            text: picked.contributions.map(x => ctx.name(x.sourceDescriptorId) + ' 的“' + stateName(x.sourceStateId) + '”格 ' + x.score).join(' + ') + ' = ' + b.selectedSupport
          };
        }
      } catch { /* 配置不属于该输入时不给代入 */ }
    }
  }
  // 刷新后全空间归档只存在于会话里；改用「检验我的方案」当时落盘的逐条贡献，
  // 两年都能给出真实代入。代入只来自那次检验记录，不按当前页面重新编。
  if (!ctx.trace) {
    const records = Object.values(readPlanChecks(p.id)).filter(r => r?.trace?.balances?.length);
    records.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const record = records[0];
    if (record) {
      ctx.trace = record.trace;
      ctx.name = name;
      ctx.traceYear = record.year;
      const b = record.trace.balances[0];
      if (b) {
        const contributions = b.contributions || [];
        ctx.sample = {
          label: record.year + ' 年方案 · ' + name(b.descriptorId) + ' 取“' + stateName(b.selectedStateId) + '”' + (record.consistent ? '' : '（该年方案有冲突）'),
          text: contributions.map(x => name(x.sourceDescriptorId) + ' 的“' + stateName(x.sourceStateId) + '”格 ' + x.score).join(' + ') + ' = ' + b.selectedSupport
        };
      }
    }
  }
  return ctx;
}
