// P8 草案模块：把用户提供的一段材料交给本地模型，生成带出处的候选条目，再由用户逐条采用。
// 三条不可越过的边界：
// 1. 传输可注入：requestDraft 只认识 (request)=>response，Node 里用假传输就能覆盖全部失败分支，
//    真实网络只出现在 createOllamaTransport 一层。
// 2. 每条必须有出处：追不到材料或项目描述符的条目一律 source.kind==='unattributed'，界面按「待核」显示，
//    不能当成有依据的内容展示。
// 3. 采用必须由用户显式点选：adoptDraft 只写入 selectedIds 里的条目，且只写成 user-assumption 证据记录，
//    不产生任何评分、数值或模型参数，也不改动 selection（含 lockedStateIds）。
// 本模块不保存密钥，不写死任何政策编号、DOI 或网址；唯一的固定地址是本机 Ollama 端口。
// 页面接线（把草案渲染成人可点选的一屏）由 app.mjs 的所有者负责；本模块只提供纯逻辑与传输，便于离线测试。
import { validateProject } from '../../core/contracts.mjs';

export const OLLAMA_DEFAULT_BASE_URL = 'http://127.0.0.1:11434';
export const OLLAMA_CHAT_PATH = '/api/chat';
export const OLLAMA_TAGS_PATH = '/api/tags';
export const DEFAULT_DRAFT_MODEL = 'qwen3:8b';
export const REVIEW_MARK = '待核';
export const GROUNDED_MARK = '有出处';

// 失败信息逐条分开：界面要能区分「服务没起来」「HTTP 出错」「回复不是 JSON」「只返回思考」「回复为空」，
// 这几种情况用户要做的下一步并不一样。
export const DRAFT_ERRORS = {
  model: '没有指定模型：请先列出本地模型并显式选择，再生成草案。',
  unreachable: '未能连接本地模型服务：请确认 Ollama 已在运行，且地址可以访问。',
  http: '模型服务返回非正常状态：',
  json: '模型服务返回的内容不是有效 JSON：无法解析本次回复。',
  thinkingOnly: '模型只返回了思考内容：本次没有可用的正文，请用不思考模式重试。',
  empty: '模型返回了空内容：本次没有可用的草案文本。',
  service: '模型服务报告错误：'
};

// 材料可以是纯文本、多段文本或 {text}：只取用户实际给的内容，不补任何默认引文。
export function materialText(material) {
  if (typeof material === 'string') return material;
  if (Array.isArray(material)) return material.map(materialText).filter(Boolean).join('\n');
  if (material && typeof material === 'object' && typeof material.text === 'string') return material.text;
  return '';
}

function stateListFor(descriptors, states) {
  const given = Array.isArray(states) ? states : [];
  return descriptors.flatMap(descriptor => {
    const embedded = Array.isArray(descriptor.states) ? descriptor.states : [];
    const own = [...given, ...embedded].filter(state => state && state.descriptorId === descriptor.id);
    const seen = new Set();
    return own.filter(state => state.id && !seen.has(state.id) && seen.add(state.id));
  });
}

// 提示词必须带上项目真实范围与真实描述符/状态名称：模型只能在这些名称里说话，
// 否则生成的东西无法落到本项目上。材料按原文整段给出，不摘要、不改写。
export function buildDraftPrompt({ material = '', project = null, descriptors = [], states = [] } = {}) {
  const list = Array.isArray(descriptors) ? descriptors.filter(Boolean) : [];
  const scoped = stateListFor(list, states);
  const region = project?.scope?.regionId || '未指定';
  const years = Array.isArray(project?.scope?.years) && project.scope.years.length ? project.scope.years.join(' / ') : '未指定';
  const name = project?.title || '未命名情景项目';
  const lines = list.length
    ? list.map(descriptor => {
      const own = scoped.filter(state => state.descriptorId === descriptor.id).map(state => state.label + '（' + state.id + '）');
      return '- ' + (descriptor.label || descriptor.id) + '（' + descriptor.id + '）' + (own.length ? '；已有状态：' + own.join('、') : '；尚无状态定义');
    })
    : ['（项目里还没有描述符，先不要提出任何变量名称）'];
  const materialBody = materialText(material).trim() || '（本次没有提供材料）';
  const system = [
    '你是情景分析项目的草案助手，只依据用户提供的材料和项目已有的描述符、状态写出候选条目，供人工逐条核对。',
    '规则：',
    '1. 只用中文回答；一行一条候选，行首用「- 」。',
    '2. 只能使用下面列出的描述符与状态名称，不要发明新的变量、状态、编号或名称。',
    '3. 不要写任何评分、分数、分值、权重或影响强度数值；这类判断必须由用户逐格填写。',
    '4. 不要编造政策编号、文件号、DOI、网址或原文引语，也不要引用材料之外的原话；只能复述材料里出现过的内容。',
    '5. 材料或项目清单里找不到依据的内容，必须在该条末尾写明「' + REVIEW_MARK + '」。',
    '6. 每条只写一件事，不写开场白、解释和总结。'
  ].join('\n');
  const user = [
    '项目：' + name,
    '项目范围：地区 ' + region + '；研究年份 ' + years + '。',
    '项目里已有的描述符与状态（只能引用这些名称）：',
    lines.join('\n'),
    '',
    '用户提供的材料（原文）：',
    '<<<',
    materialBody,
    '>>>',
    '',
    '请写出候选草案条目，一行一条，行首用「- 」。写不出有依据的条目时，直接写「材料不足，' + REVIEW_MARK + '」。'
  ].join('\n');
  return { system, user };
}

// 真实传输：只认相对路径，拼上本机 Ollama 地址。fetchImpl 可替换，测试里不需要真实网络。
export function createOllamaTransport({ baseUrl = OLLAMA_DEFAULT_BASE_URL, fetchImpl = globalThis.fetch } = {}) {
  const root = String(baseUrl ?? '').replace(/\/+$/, '');
  return async function ollamaTransport({ path = OLLAMA_CHAT_PATH, method = 'GET', body = null, signal = null } = {}) {
    const init = { method, signal };
    if (body !== null && body !== undefined) {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(body);
    }
    return fetchImpl(root + path, init);
  };
}

function responseStatus(response) {
  return typeof response?.status === 'number' ? response.status : null;
}

function responseOk(response) {
  if (typeof response?.ok === 'boolean') return response.ok;
  const status = responseStatus(response);
  return status === null || (status >= 200 && status < 300);
}

// 一次生成。任何失败都以 {ok:false,error} 返回，不抛错出界面；
// detail 只放诊断细节，界面显示的是上面那几条中文说明。
// think:false 是必须的：qwen3 默认思考模式下 message.content 为空，正文全在 thinking 里。
export async function requestDraft({ transport, model, prompt, signal = null } = {}) {
  const system = typeof prompt?.system === 'string' ? prompt.system : '';
  const user = typeof prompt?.user === 'string' ? prompt.user : '';
  if (typeof transport !== 'function') return { ok: false, text: '', thinking: '', model: model ?? null, error: DRAFT_ERRORS.unreachable, detail: 'transport 不是函数' };
  if (typeof model !== 'string' || !model.trim()) return { ok: false, text: '', thinking: '', model: null, error: DRAFT_ERRORS.model, detail: '' };
  let response = null;
  try {
    response = await transport({
      path: OLLAMA_CHAT_PATH, method: 'POST', signal,
      body: { model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], stream: false, think: false }
    });
  } catch (error) {
    return { ok: false, text: '', thinking: '', model, error: DRAFT_ERRORS.unreachable, detail: String(error?.message ?? error) };
  }
  if (!responseOk(response)) {
    return { ok: false, text: '', thinking: '', model, error: DRAFT_ERRORS.http + 'HTTP ' + (responseStatus(response) ?? '未知') + '；请检查模型是否已安装以及服务日志。', detail: '' };
  }
  let payload = null;
  try {
    if (!response || typeof response.json !== 'function') throw new TypeError('响应没有 json()');
    payload = await response.json();
  } catch (error) {
    return { ok: false, text: '', thinking: '', model, error: DRAFT_ERRORS.json, detail: String(error?.message ?? error) };
  }
  const message = payload?.message && typeof payload.message === 'object' ? payload.message : {};
  const content = typeof message.content === 'string' ? message.content.trim() : '';
  const thinking = typeof message.thinking === 'string' ? message.thinking.trim() : '';
  const served = typeof payload?.model === 'string' && payload.model ? payload.model : model;
  if (typeof payload?.error === 'string' && payload.error) return { ok: false, text: '', thinking, model: served, error: DRAFT_ERRORS.service + payload.error, detail: '' };
  // 思考模式的特征组合：正文为空而思考非空。这和「模型什么都没说」是两件事，必须分开报。
  if (!content && thinking) return { ok: false, text: '', thinking, model: served, error: DRAFT_ERRORS.thinkingOnly, detail: '' };
  if (!content) return { ok: false, text: '', thinking: '', model: served, error: DRAFT_ERRORS.empty, detail: '' };
  return { ok: true, text: content, thinking, model: served, error: null, detail: '' };
}

// 列出本地模型名。服务不可用时返回空数组，让调用方显示「未发现本地模型」，不抛错。
export async function listModels({ transport } = {}) {
  if (typeof transport !== 'function') return [];
  try {
    const response = await transport({ path: OLLAMA_TAGS_PATH, method: 'GET' });
    if (!responseOk(response) || typeof response?.json !== 'function') return [];
    const payload = await response.json();
    const names = (Array.isArray(payload?.models) ? payload.models : [])
      .map(item => (typeof item?.name === 'string' && item.name) || (typeof item?.model === 'string' && item.model) || '')
      .filter(Boolean);
    return [...new Set(names)];
  } catch { return []; }
}

function cleanLine(line) {
  return String(line ?? '')
    .replace(/^\s*(?:[-*+•·]|\d+\s*[.、)．]|#+)\s*/, '')
    .replace(/^\*\*|\*\*$/g, '')
    .replace(/\s+$/, '')
    .trim();
}

// 只过滤明显的小标题行（很短且以冒号结尾），不猜内容好坏。
function looksLikeHeading(line) {
  return /^[^，。；]{1,20}[：:]$/.test(line);
}

// 一行一条；整段只有一行时按句号/分号切成候选，避免把一整段当成一条。
function splitCandidates(text) {
  const lines = String(text ?? '').split(/\r?\n/).map(cleanLine).filter(line => line && !looksLikeHeading(line));
  if (lines.length > 1) return lines;
  return String(lines[0] ?? '').split(/[。；;]/).map(cleanLine).filter(Boolean);
}

function collectLabels(descriptors, states) {
  const list = Array.isArray(descriptors) ? descriptors.filter(Boolean) : [];
  const scoped = stateListFor(list, states);
  const labels = [];
  for (const descriptor of list) {
    if (typeof descriptor.label === 'string' && descriptor.label.trim()) {
      labels.push({ label: descriptor.label.trim(), kind: 'project-descriptor', match: 'descriptor', descriptorId: descriptor.id, stateId: null });
    }
  }
  for (const state of scoped) {
    if (typeof state.label === 'string' && state.label.trim()) {
      labels.push({ label: state.label.trim(), kind: 'project-descriptor', match: 'state', descriptorId: state.descriptorId, stateId: state.id });
    }
  }
  // 长标签优先：材料里同时出现「示例变量A」和「示例变量A档」时，取更具体的那一个。
  return labels.sort((a, b) => b.label.length - a.label.length);
}

// 找条目与原文的最长连续公共片段，低于 min 个字不算出处（短词重合没有证据价值）。
// 用滚动行的最长公共子串算法：材料可能有几千字，逐窗口 includes 会退化成平方级。
function longestSharedRun(text, source, min) {
  if (!text || !source) return '';
  let previous = new Uint32Array(source.length + 1), best = 0, bestEnd = 0;
  for (let i = 1; i <= text.length; i++) {
    const current = new Uint32Array(source.length + 1);
    const ch = text[i - 1];
    for (let j = 1; j <= source.length; j++) {
      if (ch !== source[j - 1]) continue;
      const run = previous[j - 1] + 1;
      current[j] = run;
      if (run > best) { best = run; bestEnd = i; }
    }
    previous = current;
  }
  return best >= min ? text.slice(bestEnd - best, bestEnd) : '';
}

const stripSpace = value => String(value ?? '').replace(/\s+/g, '');
const EXCERPT_LIMIT = 60;

function excerptOf(run) {
  return run.length > EXCERPT_LIMIT ? run.slice(0, EXCERPT_LIMIT) + '…' : run;
}

// 给一条候选找出处。优先项目描述符（措辞更具体），其次材料原文，两者都没有就是 unattributed。
// 只提到描述符、却在材料里找不到对应原文的条目仍算「有出处」，但必须标 needsReview：
// 名称落在项目里不等于这句话的内容有依据，界面按「待核」显示，不能当成已核实结论。
function attributeItem(text, { source, labels }) {
  const run = longestSharedRun(stripSpace(text), stripSpace(source), 6);
  const hit = labels.find(item => text.includes(item.label));
  if (hit) {
    const attributed = { kind: 'project-descriptor', descriptorId: hit.descriptorId, label: hit.label, match: hit.match };
    if (hit.stateId) attributed.stateId = hit.stateId;
    if (run) attributed.materialExcerpt = excerptOf(run);
    return { source: attributed, needsReview: !run };
  }
  if (run) return { source: { kind: 'material', excerpt: excerptOf(run) }, needsReview: false };
  return { source: { kind: 'unattributed' }, needsReview: true };
}

// 把模型回复拆成候选条目。每条都必须带 source：材料原文片段、项目描述符，或明确的无出处。
// 条目只是草案，不构成评分或结论；id 只在本次解析内稳定，供界面勾选。
export function parseDraft({ text = '', material = '', descriptors = [], states = [] } = {}) {
  const source = materialText(material);
  const labels = collectLabels(descriptors, states);
  return splitCandidates(text).map((line, index) => {
    const { source: origin, needsReview } = attributeItem(line, { source, labels });
    return { id: 'item-' + (index + 1), text: line, source: origin, needsReview, statusText: needsReview ? REVIEW_MARK : GROUNDED_MARK };
  });
}

// 供界面显示：有出自材料的原文片段才算已核实；只对上名称、或完全没有出处的都显示「待核」。
export function itemStatusText(item) {
  if (!item?.source || item.source.kind === 'unattributed' || item.needsReview !== false) return REVIEW_MARK;
  return GROUNDED_MARK;
}

export function describeSource(source) {
  if (!source || typeof source !== 'object') return REVIEW_MARK + '：未能追溯到材料或项目描述符，需人工核对';
  if (source.kind === 'material') return '出处：材料原文「' + (source.excerpt || '') + '」';
  if (source.kind === 'project-descriptor' && source.materialExcerpt) {
    return '出处：项目描述符「' + (source.label || source.descriptorId) + '」，材料原文「' + source.materialExcerpt + '」';
  }
  if (source.kind === 'project-descriptor') return '出处：项目描述符「' + (source.label || source.descriptorId) + '」（材料中未找到对应原文，内容待核）';
  return REVIEW_MARK + '：未能追溯到材料或项目描述符，需人工核对';
}

// 草案只能提出结构之外的内容：写入分数、新建或改动描述符/状态/路径都超出本模块能表达的范围。
// 命中即返回中文原因，条目留在 rejected 里可见，不会被悄悄丢掉。
const REJECT_RULES = [
  {
    code: 'SCORE_NOT_ALLOWED',
    test: /(评分|打分|赋分|分数|分值|权重|影响强度)\s*(为|是|设为|定为|记为|=|：|:)\s*[+＋−-]?\d|(设为|赋值|取值为?|记为|定为|改成|调整为)\s*[+＋−-]?\d/,
    reason: '草案试图直接给出评分或数值：评分必须由你在“关系与假设”里逐格填写，本模块不写入任何分数。'
  },
  {
    code: 'STRUCTURE_NOT_ALLOWED',
    test: /(新增|添加|增加|创建|建立|新建|补充)[^。；，]{0,8}(描述符|变量|指标|状态|档位|路径|时间路径|分类|节点|参数|模型)/,
    reason: '草案试图新增描述符、状态或时间路径：这些要在“因素与方案”“政策实施路径”里定义后写入，本模块不代建项目结构。'
  },
  {
    code: 'STRUCTURE_NOT_ALLOWED',
    test: /(删除|移除|改名|重命名|修改)[^。；，]{0,8}(描述符|变量|指标|状态|路径|分类|节点)/,
    reason: '草案试图改动已有描述符、状态或路径：本模块只新增待核条目，不改动已有定义。'
  }
];

function rejectReasonFor(item) {
  const text = String(item?.text ?? '').trim();
  if (!text) return { code: 'EMPTY_ITEM', reason: '条目为空：没有可写入的内容。' };
  for (const rule of REJECT_RULES) if (rule.test.test(text)) return { code: rule.code, reason: rule.reason };
  return null;
}

function evidenceSourceId(source) {
  if (source?.kind === 'project-descriptor' && source.descriptorId) return source.descriptorId;
  if (source?.kind === 'material') return 'user-material';
  return 'ai-draft';
}

function provenanceExcerpt(item) {
  const source = item?.source;
  if (source?.kind === 'material' && source.excerpt) return source.excerpt;
  if (source?.kind === 'project-descriptor' && source.label) return source.label;
  return String(item?.text ?? '');
}

// 有描述符/状态出处的条目挂到对应记录上，成为可追踪的证据引用。
// 这里刻意不改记录 version：描述符版本被受限二档图形编码绑定，改版本会让已有编码判定失效
//（见 relationships/curve.mjs 的同版本改动检查），而追加证据引用不改变定义。
function attachEvidence(next, item, evidenceId) {
  const source = item?.source;
  if (source?.kind !== 'project-descriptor') return null;
  if (source.match === 'state' && source.stateId) {
    const state = next.data.states.find(record => record.id === source.stateId);
    if (state) {
      state.evidenceRefs = [...new Set([...(state.evidenceRefs || []), evidenceId])];
      return { kind: 'state', id: state.id, label: state.label };
    }
  }
  const descriptor = next.data.descriptors.find(record => record.id === source.descriptorId);
  if (!descriptor) return null;
  descriptor.evidenceRefs = [...new Set([...(descriptor.evidenceRefs || []), evidenceId])];
  return { kind: 'descriptor', id: descriptor.id, label: descriptor.label };
}

function resolveMakeId(makeId) {
  if (typeof makeId === 'function') return makeId;
  const random = globalThis.crypto?.randomUUID;
  if (typeof random === 'function') return () => random.call(globalThis.crypto);
  throw new Error('缺少 makeId：无法为采用条目生成稳定ID。');
}

// 采用：把用户勾选的草案条目写成新的 user-assumption 证据记录，返回一份新的项目，原项目不动。
// 只采用 selectedIds 里的条目；写不进项目结构的条目进 rejected 并给出中文原因。
// 本函数不写 data.judgments、不产生任何数值、不动 selection（含 lockedStateIds）。
// 证据类型固定为 user-assumption：材料是用户提供的文本，不是已核实的政策或论文，
// 因此不能标成 policy/paper，也不能给它编一个政策编号或 DOI。
export function adoptDraft({ project, items = [], selectedIds = [], makeId } = {}) {
  const next = structuredClone(project);
  const list = Array.isArray(items) ? items : [];
  const chosen = new Set(Array.isArray(selectedIds) ? selectedIds : []);
  const known = new Set(list.map(item => item?.id));
  const adopted = [], rejected = [];
  // 勾选项在本次草案里找不到，说明它是上一次生成的结果：显式报出，不猜也不静默跳过。
  for (const missing of chosen) if (!known.has(missing)) rejected.push({ id: missing, text: '', source: null, code: 'NOT_IN_DRAFT', reason: '所选条目不在本次草案里：可能来自上一次生成的结果，未采用。' });
  const newId = chosen.size ? resolveMakeId(makeId) : null;
  for (const item of list) {
    if (!item || !chosen.has(item.id)) continue;
    const rejectedReason = rejectReasonFor(item);
    if (rejectedReason) { rejected.push({ id: item.id, text: String(item.text ?? ''), source: item.source ?? null, ...rejectedReason }); continue; }
    const sourceId = evidenceSourceId(item.source);
    const evidenceId = newId();
    const evidence = {
      id: evidenceId,
      kind: 'user-assumption',
      sourceId,
      locator: 'ai-draft:' + item.id,
      excerpt: String(item.text).trim(),
      reviewStatus: item.needsReview || item.source?.kind === 'unattributed' ? 'pending-review' : 'draft',
      version: 1,
      provenance: { origin: 'ai', sourceId, excerpt: provenanceExcerpt(item) }
    };
    next.data.evidence.push(evidence);
    const attachedTo = attachEvidence(next, item, evidenceId);
    adopted.push({ id: item.id, text: evidence.excerpt, source: item.source ?? { kind: 'unattributed' }, evidenceId, attachedTo, needsReview: Boolean(item.needsReview) });
  }
  // 采用后的项目必须仍满足契约：写坏了要在这里报错，而不是把坏项目交给 store。
  validateProject(next);
  return { project: next, adopted, rejected };
}
