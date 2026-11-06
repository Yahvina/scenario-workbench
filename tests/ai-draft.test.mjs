// P8 草案模块测试：传输全部用假实现，Node 里不碰网络；只有最后一节做一次真实调用，服务不在就跳过。
// 这里不发明任何政策编号、DOI 或引语；测试材料是自己写的示例句子，且明确标为示例。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoProject } from '../src/fixtures/demo.mjs';
import {
  DRAFT_ERRORS, DEFAULT_DRAFT_MODEL, OLLAMA_CHAT_PATH, OLLAMA_TAGS_PATH,
  buildDraftPrompt, requestDraft, createOllamaTransport, listModels, parseDraft, adoptDraft, describeSource, itemStatusText
} from '../src/modules/exports/ai-draft.mjs';

// 假响应按真实 Ollama 形状构造：{ok, status, json()}。
const reply = payload => ({ ok: true, status: 200, json: async () => payload });
const chatReply = content => reply({ model: DEFAULT_DRAFT_MODEL, message: { role: 'assistant', content, thinking: '' } });
const fakeTransport = payload => async () => (typeof payload === 'function' ? payload() : payload);

// 示例材料：句子由本测试自己写，不对应任何真实政策文件。
const SAMPLE_MATERIAL = '示例材料：本地区把示例变量A列为重点，示例变量B作为配套条件；材料未给出任何数值。';

function promptFixture() {
  const project = createDemoProject();
  const descriptors = project.data.descriptors;
  const states = project.data.states;
  return { project, descriptors, states, material: SAMPLE_MATERIAL };
}

test('正常回复：ok 为真，条目解析后每条都有出处', async () => {
  const text = '- 示例变量A列为重点\n- 示例变量B作为配套条件';
  const result = await requestDraft({ transport: fakeTransport(chatReply(text)), model: DEFAULT_DRAFT_MODEL, prompt: { system: 's', user: 'u' } });
  assert.equal(result.ok, true);
  assert.equal(result.error, null);
  assert.equal(result.text, text);
  assert.equal(result.model, DEFAULT_DRAFT_MODEL);
  const { material, descriptors, states } = promptFixture();
  const items = parseDraft({ text: result.text, material, descriptors, states });
  assert.equal(items.length, 2);
  for (const item of items) assert.ok(item.source && typeof item.source.kind === 'string', '每条都必须带 source');
  assert.equal(items[0].source.kind, 'project-descriptor');
  assert.equal(items[0].source.label, '示例变量A');
  assert.equal(items[0].needsReview, false);
  assert.equal(items[1].source.label, '示例变量B');
});

test('只返回思考内容：报「模型只返回了思考内容」，不当成正常空回复', async () => {
  const payload = { model: DEFAULT_DRAFT_MODEL, message: { role: 'assistant', content: '', thinking: '让我先想一想这个问题……' } };
  const result = await requestDraft({ transport: fakeTransport(reply(payload)), model: DEFAULT_DRAFT_MODEL, prompt: { system: 's', user: 'u' } });
  assert.equal(result.ok, false);
  assert.equal(result.error, DRAFT_ERRORS.thinkingOnly);
  assert.ok(result.thinking.length > 0);
  assert.notEqual(result.error, DRAFT_ERRORS.empty);
});

test('完全空回复：报空内容', async () => {
  const payload = { model: DEFAULT_DRAFT_MODEL, message: { role: 'assistant', content: '   ', thinking: '' } };
  const result = await requestDraft({ transport: fakeTransport(reply(payload)), model: DEFAULT_DRAFT_MODEL, prompt: { system: 's', user: 'u' } });
  assert.equal(result.ok, false);
  assert.equal(result.error, DRAFT_ERRORS.empty);
});

test('服务不可达：传输抛错时返回 ok:false，异常不外泄', async () => {
  const transport = async () => { throw new Error('fetch failed'); };
  let result = null;
  await assert.doesNotReject(async () => { result = await requestDraft({ transport, model: DEFAULT_DRAFT_MODEL, prompt: { system: 's', user: 'u' } }); });
  assert.equal(result.ok, false);
  assert.equal(result.error, DRAFT_ERRORS.unreachable);
  assert.match(result.detail, /fetch failed/);
});

test('非 200 响应：返回 ok:false 并带状态码', async () => {
  const transport = fakeTransport({ ok: false, status: 500, json: async () => ({}) });
  const result = await requestDraft({ transport, model: DEFAULT_DRAFT_MODEL, prompt: { system: 's', user: 'u' } });
  assert.equal(result.ok, false);
  assert.match(result.error, /HTTP 500/);
});

test('回复不是有效 JSON：返回 ok:false', async () => {
  const transport = fakeTransport({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token < in JSON'); } });
  const result = await requestDraft({ transport, model: DEFAULT_DRAFT_MODEL, prompt: { system: 's', user: 'u' } });
  assert.equal(result.ok, false);
  assert.equal(result.error, DRAFT_ERRORS.json);
});

test('没有显式模型：不发起调用，报缺模型', async () => {
  let called = false;
  const transport = async () => { called = true; return reply({}); };
  const result = await requestDraft({ transport, model: '', prompt: { system: 's', user: 'u' } });
  assert.equal(result.ok, false);
  assert.equal(result.error, DRAFT_ERRORS.model);
  assert.equal(called, false);
});

test('请求体固定为不思考模式：think 为 false 且不流式', async () => {
  let seen = null;
  const transport = async request => { seen = request; return chatReply('- 示例变量A'); };
  await requestDraft({ transport, model: DEFAULT_DRAFT_MODEL, prompt: { system: 's', user: 'u' } });
  assert.equal(seen.path, OLLAMA_CHAT_PATH);
  assert.equal(seen.body.model, DEFAULT_DRAFT_MODEL);
  assert.equal(seen.body.think, false);
  assert.equal(seen.body.stream, false);
  assert.deepEqual(seen.body.messages.map(m => m.role), ['system', 'user']);
});

test('parseDraft：材料与描述符都对不上的条目是无出处，显示为待核', () => {
  const { material, descriptors, states } = promptFixture();
  const text = '- 示例变量A列为重点\n- 建议设置省级专项资金并逐年提高额度上限';
  const items = parseDraft({ text, material, descriptors, states });
  assert.equal(items.length, 2);
  assert.equal(items[0].source.kind, 'project-descriptor');
  assert.equal(items[1].source.kind, 'unattributed');
  assert.equal(items[1].needsReview, true);
  assert.equal(items[1].statusText, '待核');
  assert.match(describeSource(items[1].source), /未能追溯/);
});

test('parseDraft：与材料原文一段话重合的条目出处是材料片段', () => {
  const { descriptors, states } = promptFixture();
  const material = '会议记录：示例地区把重点指标列入优先事项，并要求同步配套。';
  // 句子与材料有连续重合，但不提任何描述符/状态名称，因此只能算材料出处。
  const text = '- 把重点指标列入优先事项并同步配套';
  const items = parseDraft({ text, material, descriptors, states });
  assert.equal(items[0].source.kind, 'material');
  assert.ok(material.replace(/\s+/g, '').includes(items[0].source.excerpt.replace('…', '')));
  assert.equal(items[0].needsReview, false);
});

test('parseDraft：只提到描述符名称、材料里没有对应原文时仍有出处但标为待核', () => {
  const { descriptors, states } = promptFixture();
  const items = parseDraft({
    text: '- 示例高档是当前的判断档位',
    material: '本材料只说明研究安排，没有提到任何变量。',
    descriptors, states
  });
  assert.equal(items[0].source.kind, 'project-descriptor');
  assert.equal(items[0].source.match, 'state');
  assert.equal(items[0].source.stateId, 'a-high');
  assert.equal(items[0].needsReview, true, '名称落项不等于内容有依据');
  assert.equal(items[0].statusText, '待核');
});

test('adoptDraft：材料出处的条目记录为 user-material 来源，不挂到任何描述符', () => {
  const project = createDemoProject();
  const items = parseDraft({
    text: '- 把重点指标列入优先事项并同步配套',
    material: '会议记录：示例地区把重点指标列入优先事项，并要求同步配套。',
    descriptors: project.data.descriptors, states: project.data.states
  });
  assert.equal(items[0].source.kind, 'material');
  const result = adoptDraft({ project, items, selectedIds: ['item-1'], makeId: () => 'ai-draft-m' });
  const record = result.project.data.evidence.find(e => e.id === 'ai-draft-m');
  assert.equal(record.provenance.sourceId, 'user-material');
  assert.equal(record.provenance.origin, 'ai');
  assert.equal(record.kind, 'user-assumption');
  assert.equal(result.adopted[0].attachedTo, null);
  assert.equal(result.rejected.length, 0);
  assert.deepEqual(result.project.data.descriptors.map(d => d.evidenceRefs), project.data.descriptors.map(d => d.evidenceRefs));
});

test('itemStatusText：只有对上材料原文才算已核实，其余一律待核', () => {
  const { material, descriptors, states } = promptFixture();
  const items = parseDraft({
    text: '- 示例变量A列为重点\n- 示例变量A的状态为示例高档\n- 建议设置省级专项资金',
    material, descriptors, states
  });
  assert.equal(itemStatusText(items[0]), '有出处');
  assert.equal(itemStatusText(items[1]), '待核');
  assert.equal(itemStatusText(items[2]), '待核');
  assert.equal(itemStatusText(null), '待核');
  assert.match(describeSource(items[0].source), /材料原文/);
  assert.match(describeSource(items[1].source), /材料中未找到对应原文/);
  assert.match(describeSource(items[2].source), /未能追溯/);
});

test('buildDraftPrompt：带真实描述符标签、真实范围，并要求中文输出与标记待核', () => {
  const { project, descriptors, states, material } = promptFixture();
  const prompt = buildDraftPrompt({ material, project, descriptors, states });
  assert.equal(typeof prompt.system, 'string');
  assert.equal(typeof prompt.user, 'string');
  for (const label of ['示例变量A', '示例变量B', '示例低档', '示例高档']) assert.ok(prompt.user.includes(label), '提示词缺少真实标签：' + label);
  assert.ok(prompt.user.includes(project.scope.regionId));
  assert.ok(prompt.user.includes('2030'));
  assert.ok(prompt.user.includes(SAMPLE_MATERIAL.trim()));
  assert.match(prompt.system, /只用中文回答/);
  assert.match(prompt.system, /待核/);
  assert.match(prompt.system, /不要写任何评分/);
  assert.match(prompt.system, /不要编造政策编号/);
});

test('adoptDraft：只采用勾选条目，原项目不变，不产生评分，也不动锁定状态', () => {
  const project = createDemoProject();
  project.selection.lockedStateIds = ['a-high'];
  const before = structuredClone(project);
  const items = parseDraft({
    text: '- 示例变量A列为重点\n- 示例变量B作为配套条件\n- 建议把评分设为 3 并纳入检算',
    material: SAMPLE_MATERIAL, descriptors: project.data.descriptors, states: project.data.states
  });
  assert.equal(items.length, 3);
  let n = 0;
  const ids = () => 'ai-draft-test-' + (++n);
  const result = adoptDraft({ project, items, selectedIds: ['item-1', 'item-3'], makeId: ids });

  assert.deepEqual(project, before, '原项目对象必须保持不变');
  assert.deepEqual(result.project.data.judgments, before.data.judgments, '不得新建或改动影响判断');
  assert.deepEqual(result.project.selection.lockedStateIds, ['a-high'], '锁定状态不得被改动');
  assert.deepEqual(result.project.selection, before.selection);
  // 本模块不自己改修订号：修订号由 store.commit 按科学键变化统一递增。
  assert.equal(result.project.revision, before.revision);
  assert.equal(result.adopted.length, 1, '两条勾选里只有条1可写，条3被拒');
  assert.equal(result.adopted[0].id, 'item-1');
  assert.equal(result.adopted[0].source.kind, 'project-descriptor');
  assert.equal(result.adopted[0].attachedTo.id, 'descriptor-a');
  assert.equal(result.rejected.length, 1);
  assert.equal(result.rejected[0].id, 'item-3');
  assert.equal(result.rejected[0].code, 'SCORE_NOT_ALLOWED');
  assert.match(result.rejected[0].reason, /评分/);

  const added = result.project.data.evidence.filter(record => record.provenance.origin === 'ai');
  assert.equal(added.length, 1, '只写入被采用的条目');
  assert.equal(added[0].kind, 'user-assumption');
  assert.equal(added[0].provenance.origin, 'ai');
  assert.equal(added[0].provenance.sourceId, 'descriptor-a');
  assert.ok(added[0].provenance.excerpt.includes('示例变量A'));
  assert.equal(added[0].excerpt, '示例变量A列为重点');
  assert.ok(added[0].locator.includes('item-1'));
  // 只追加证据引用，不改描述符版本：版本被受限二档编码绑定，改版本会让已有编码判定失效。
  assert.equal(result.project.data.descriptors.find(d => d.id === 'descriptor-a').version, before.data.descriptors.find(d => d.id === 'descriptor-a').version);
  assert.ok(result.project.data.descriptors.find(d => d.id === 'descriptor-a').evidenceRefs.includes(result.adopted[0].evidenceId));
  assert.ok(!result.project.data.descriptors.find(d => d.id === 'descriptor-b').evidenceRefs.includes(result.adopted[0].evidenceId));
  // 采用后仍是合法项目（adoptDraft 内部已校验，这里再验一次形状）。
  assert.equal(result.project.schemaVersion, 1);
  assert.equal(result.project.id, before.id);
});

test('adoptDraft：无出处条目可以写为待核证据，但不因此变成有依据', () => {
  const project = createDemoProject();
  const items = parseDraft({
    text: '- 建议设置省级专项资金并逐年提高额度上限',
    material: SAMPLE_MATERIAL, descriptors: project.data.descriptors, states: project.data.states
  });
  assert.equal(items[0].source.kind, 'unattributed');
  const result = adoptDraft({ project, items, selectedIds: ['item-1'], makeId: () => 'ai-draft-x' });
  assert.equal(result.adopted.length, 1);
  assert.equal(result.adopted[0].needsReview, true);
  const record = result.project.data.evidence.find(e => e.id === 'ai-draft-x');
  assert.equal(record.reviewStatus, 'pending-review');
  assert.equal(record.provenance.sourceId, 'ai-draft');
  assert.equal(result.project.data.judgments.length, project.data.judgments.length);
});

test('adoptDraft：未勾选任何条目时项目内容不变，只多一份同样的副本', () => {
  const project = createDemoProject();
  const before = structuredClone(project);
  const items = parseDraft({ text: '- 示例变量A列为重点', material: SAMPLE_MATERIAL, descriptors: project.data.descriptors, states: project.data.states });
  const result = adoptDraft({ project, items, selectedIds: [], makeId: () => 'unused' });
  assert.deepEqual(result.project, before);
  assert.deepEqual(result.adopted, []);
  assert.deepEqual(result.rejected, []);
  assert.deepEqual(project, before);
});

test('adoptDraft：新增描述符之类的越界条目给中文原因并留在 rejected', () => {
  const project = createDemoProject();
  const items = parseDraft({
    text: '- 新增一个描述符“示例变量C”并定义两个状态',
    material: SAMPLE_MATERIAL, descriptors: project.data.descriptors, states: project.data.states
  });
  const result = adoptDraft({ project, items, selectedIds: ['item-1'], makeId: () => 'ai-draft-y' });
  assert.equal(result.adopted.length, 0);
  assert.equal(result.rejected.length, 1);
  assert.equal(result.rejected[0].code, 'STRUCTURE_NOT_ALLOWED');
  assert.match(result.rejected[0].reason, /描述符/);
  assert.deepEqual(result.project, project);
});

test('adoptDraft：勾选项不在本次草案里时显式报出，不静默跳过', () => {
  const project = createDemoProject();
  const items = parseDraft({ text: '- 示例变量A列为重点', material: SAMPLE_MATERIAL, descriptors: project.data.descriptors, states: project.data.states });
  const result = adoptDraft({ project, items, selectedIds: ['item-9'], makeId: () => 'ai-draft-z' });
  assert.equal(result.rejected.length, 1);
  assert.equal(result.rejected[0].code, 'NOT_IN_DRAFT');
  assert.match(result.rejected[0].reason, /不在本次草案/);
  assert.equal(result.project.data.evidence.filter(e => e.provenance.origin === 'ai').length, 0);
});

test('listModels：从 /api/tags 取模型名，去重并跳过无名项', async () => {
  const transport = async request => {
    assert.equal(request.path, OLLAMA_TAGS_PATH);
    return reply({ models: [{ name: 'qwen3:8b' }, { model: 'qwen3:8b' }, { name: 'llama3:8b' }, {}] });
  };
  assert.deepEqual(await listModels({ transport }), ['qwen3:8b', 'llama3:8b']);
});

test('listModels：服务不可用时返回空数组，不抛错', async () => {
  await assert.doesNotReject(async () => {
    assert.deepEqual(await listModels({ transport: async () => { throw new Error('ECONNREFUSED'); } }), []);
    assert.deepEqual(await listModels({ transport: async () => ({ ok: false, status: 503 }) }), []);
    assert.deepEqual(await listModels({}), []);
  });
});

test('createOllamaTransport：按路径拼地址，带 JSON 头和 body', async () => {
  const seen = [];
  const transport = createOllamaTransport({ baseUrl: 'http://127.0.0.1:11434/', fetchImpl: async (url, init) => { seen.push([url, init]); return reply({ models: [] }); } });
  await transport({ path: OLLAMA_TAGS_PATH });
  await transport({ path: OLLAMA_CHAT_PATH, method: 'POST', body: { model: 'qwen3:8b' } });
  assert.equal(seen[0][0], 'http://127.0.0.1:11434/api/tags');
  assert.equal(seen[0][1].method, 'GET');
  assert.equal(seen[1][0], 'http://127.0.0.1:11434/api/chat');
  assert.equal(seen[1][1].headers['Content-Type'], 'application/json');
  assert.equal(seen[1][1].body, JSON.stringify({ model: 'qwen3:8b' }));
});

// 真实端到端：本机 Ollama 不在时优雅跳过。这条会真的发一次请求，必须带 think:false，
// 否则 qwen3:8b 会只返回思考内容而正文为空。
const live = await fetch('http://127.0.0.1:11434/api/tags').then(r => r.ok).catch(() => false);
test('real ollama call', { skip: !live }, async () => {
  const transport = createOllamaTransport();
  const models = await listModels({ transport });
  console.log('[live] 本地模型：' + models.join(', '));
  assert.ok(models.includes(DEFAULT_DRAFT_MODEL), '缺少模型：' + DEFAULT_DRAFT_MODEL);
  const project = createDemoProject();
  const prompt = buildDraftPrompt({ material: SAMPLE_MATERIAL, project, descriptors: project.data.descriptors, states: project.data.states });
  const result = await requestDraft({ transport, model: DEFAULT_DRAFT_MODEL, prompt });
  console.log('[live] ok=' + result.ok + ' text=' + JSON.stringify(result.text.slice(0, 80)));
  assert.equal(result.ok, true, '真实调用失败：' + result.error);
  assert.ok(result.text.trim().length > 0);
  assert.match(result.text, /[\u4e00-\u9fff]/, '回复里应当有中文正文');
  const items = parseDraft({ text: result.text, material: SAMPLE_MATERIAL, descriptors: project.data.descriptors, states: project.data.states });
  assert.ok(items.length > 0);
  for (const item of items) assert.ok(item.source && typeof item.source.kind === 'string');
});
