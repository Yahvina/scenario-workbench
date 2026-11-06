import pw from 'file:///C:/Users/guiqu/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js';
const { chromium } = pw;
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const url = pathToFileURL(path.join(root, 'dist/scenario-workbench.html')).href;
const shot = name => path.join(root, 'artifacts/v5', name);

// 机制样例：三个因素 × 三档，六方向满分矩阵。仅验证“年度状态→检验”接线，
// 不代表任何真实政策关系；记录来源标记为 fixture。
function buildProject() {
  const ev = [
    { id: 'ev-paper', kind: 'paper', sourceId: '10.0000/mechanism', locator: '机制样例', excerpt: '机制样例依据，不是真实文献。', version: 1, provenance: { origin: 'fixture', sourceId: 'mechanism' }, evidenceRefs: [] },
    { id: 'ev-plan', kind: 'user-assumption', sourceId: 'plan', locator: 'plan@v1', excerpt: '按年选择的状态安排。', version: 1, provenance: { origin: 'user', sourceId: 'plan' }, evidenceRefs: [] }
  ];
  const desc = ['甲', '乙', '丙'].map((label, i) => ({ id: 'd' + i, label: '机制因素' + label, role: 'input', stateIds: [0, 1, 2].map(s => 's' + i + s), evidenceRefs: ['ev-paper'], version: 1, provenance: { origin: 'fixture', sourceId: 'mechanism' } }));
  const states = [];
  for (let i = 0; i < 3; i++) for (let s = 0; s < 3; s++) states.push({ id: 's' + i + s, descriptorId: 'd' + i, label: ['低', '中', '高'][s], range: null, unit: null, validYears: [2030, 2035], scope: { regionId: '京津冀' }, evidenceRefs: [], version: 1, provenance: { origin: 'fixture', sourceId: 'mechanism' } });
  const judgments = [];
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
    if (a === b) continue;
    const entries = [];
    for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) {
      const score = x === y ? (a < b ? 1 : -1) : (y > x ? 1 : -1);
      entries.push({ sourceStateId: 's' + a + x, targetStateId: 's' + b + y, score });
    }
    judgments.push({ id: 'j' + a + b, sourceDescriptorId: 'd' + a, targetDescriptorId: 'd' + b, entries, scope: { regionId: '京津冀' }, validYears: [2030, 2035], directness: 'direct', reviewStatus: 'reviewed', evidenceRefs: ['ev-paper'], rationale: '机制样例', alternatives: [], version: 1, provenance: { origin: 'fixture', sourceId: 'mechanism' } });
  }
  const plan = {
    id: 'plan-d0', descriptorId: 'd0', unit: null, scope: { regionId: '京津冀' }, interpolation: 'none',
    points: [{ year: 2030, value: null, stateId: 's02', origin: 'user-assumption', evidenceRefs: ['ev-plan'] }, { year: 2035, value: null, stateId: 's01', origin: 'user-assumption', evidenceRefs: ['ev-plan'] }],
    version: 1, provenance: { origin: 'user', sourceId: 'plan-d0', locator: 'state-plan' }, evidenceRefs: ['ev-plan']
  };
  const plan1 = JSON.parse(JSON.stringify(plan));
  Object.assign(plan1, { id: 'plan-d1', descriptorId: 'd1', points: plan1.points.map(p => ({ ...p, stateId: p.year === 2030 ? 's11' : 's12' })) });
  return {
    schemaVersion: 1, contractVersion: '1.0.0', id: 'probe-plan-bridge', title: '机制样例：年度方案接线', revision: 0,
    view: { perspective: 'public', module: 'workspace', objectId: null },
    scope: { regionId: '京津冀', years: [2030, 2035] },
    data: { policies: [], taxonomy: [], descriptors: desc, states, paths: [plan, plan1], judgments, evidence: ev, mappings: [] },
    selection: { nodeIds: [], descriptorIds: ['d0', 'd1', 'd2'], stateIds: [], lockedStateIds: [] }
  };
}

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox', '--disable-gpu'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('dialog', d => d.accept());
await page.addInitScript(p => localStorage.setItem('scenario-workbench.project.v1', JSON.stringify(p)), buildProject());
await page.goto(url);
await page.waitForTimeout(500);
console.log('start page?', (await page.locator('body').innerText()).slice(0, 200).replace(/\n/g, ' / '));

// 直接进入求解页（项目已有数据）
await page.locator('.nav-item', { hasText: '检验与结果' }).click();
await page.waitForTimeout(400);
const planText = await page.locator('[data-plan-check]').innerText().catch(() => '(none)');
console.log('--- PLAN BEFORE YEAR ---\n' + planText.slice(0, 500));

console.log('FILLCOUNT=',await page.locator('.solver-fill-unique').count());
console.log('CTRLTAIL=',await page.evaluate(()=>{const d=[...document.querySelectorAll('details')].find(x=>x.textContent.includes('核对各方向使用哪条评分'));return d?d.outerHTML.slice(-700):'no';}));
console.log('CTRL=',await page.evaluate(()=>{const d=[...document.querySelectorAll('details')].find(x=>x.textContent.includes('核对各方向使用哪条评分'));return d?d.outerHTML.slice(0,900):'no';}));
console.log('ALL BUTTONS:', JSON.stringify(await page.locator('button').allInnerTexts()));
// 选年份 2030
const yearSelect = page.getByLabel('检算年份', { exact: true });
if (await yearSelect.count()) {
  await yearSelect.selectOption('2030');
  await page.waitForTimeout(300);
}
console.log('--- PLAN 2030 ---\n' + (await page.locator('[data-plan-check]').innerText()).slice(0, 1200));
await page.screenshot({ path: shot('g1-plan-2030.png'), fullPage: true });

// 就地补选缺失状态
const miss = page.locator('.plan-check-row.is-missing select');
if (await miss.count()) {
  await miss.first().selectOption('s22');
  await page.waitForTimeout(400);
  console.log('--- AFTER INLINE FILL ---\n' + (await page.locator('[data-plan-check]').innerText()).slice(0, 900));
}
console.log('PATHS AFTER FILL:', await page.evaluate(()=>{const x=JSON.parse(localStorage.getItem('scenario-workbench.project.v1'));return JSON.stringify(x.data.paths.map(pp=>[pp.descriptorId,pp.points.map(q=>[q.year,q.stateId])]));}));
console.log('STORAGE MSG:', await page.evaluate(()=>document.querySelector('.storage-status')?.textContent||'(none)'));
const uniq = page.locator('.solver-fill-unique button');
await page.evaluate(()=>{const d=document.querySelector('.solver-fill-unique')?.closest('details');if(d)d.open=true;});
if (await uniq.count()) { await uniq.first().click(); await page.waitForTimeout(400); console.log('--- AFTER SELECT UNIQUE ---\n' + (await page.locator('[data-plan-check]').innerText()).slice(0,700));
  console.log('DIAG:', await page.evaluate(()=>document.querySelector('.solver-diagnostics')?.textContent.slice(0,700))); }
// 勾选“依据不足/量表假设”，与真实使用一致
const ack = page.getByLabel('按当前草案、依据不足及量表假设检算');
if (await ack.count()) { await ack.check(); await page.waitForTimeout(300); }
const btn = page.locator('[data-plan-check-run]');
console.log('button enabled:', await btn.isEnabled().catch(() => 'missing'));
if (await btn.isEnabled().catch(() => false)) {
  await btn.click();
  await page.waitForTimeout(400);
  console.log('--- PLAN CHECKED ---\n' + (await page.locator('[data-plan-check]').innerText()).slice(0, 1600));
  await page.screenshot({ path: shot('g1-plan-checked.png'), fullPage: true });
}

// 跑全空间基线，验证“方案是否在自洽集合里”
await page.getByRole('button', { name: '开始检验' }).click();
await page.waitForTimeout(1500);
console.log('RESULT:', await page.evaluate(()=>document.querySelector('[data-solver-result]')?.textContent));
console.log('MEMBER:', await page.evaluate(()=>document.querySelector('.plan-check-member')?.textContent));
await page.screenshot({ path: shot('g1-plan-run.png'), fullPage: true });

// 2035 应产生不同配置
if (await yearSelect.count()) {
  await yearSelect.selectOption('2035');
  await page.waitForTimeout(300);
  console.log('--- PLAN 2035 ---\n' + (await page.locator('[data-plan-check]').innerText()).slice(0, 900));
  await page.screenshot({ path: shot('g1-plan-2035.png'), fullPage: true });
}
console.log('ERRORS:', errors);
await browser.close();
