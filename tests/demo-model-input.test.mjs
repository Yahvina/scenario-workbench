import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAPPING_PROVENANCE, MAPPING_STATUS_LABEL, MODEL_MAPPINGS, MAPPING_GAPS, MODEL_INPUT_FILENAME,
  mappingFor, inputCandidates, buildModelInput, sampleToJson, sampleToCsv
} from '../src/modules/exports/model-mapping.mjs';

// 夹具按项目真实形状构造：范围、描述符、状态都齐全，provenance 字段与 fixtures/demo.mjs 一致。
// 描述符编号刻意用证据文件里的 D01 / D04 / D07 / D10，直接对上映射表，不新造对应关系。
function project(overrides = {}) {
  const base = {
    schemaVersion: 1,
    contractVersion: '1.0.0',
    id: 'proj-demo-p9',
    title: '模型输入样例夹具',
    revision: 3,
    provenance: { origin: 'fixture', sourceId: 'fixture-p9', locator: 'tests/demo-model-input.test.mjs' },
    scope: { regionId: '示例地区（非真实政策）', years: [2030, 2035] },
    data: {
      descriptors: [
        { id: 'D01', label: '经济增长速度', role: 'input' },
        { id: 'D04', label: '一次能源结构', role: 'outcome' },
        { id: 'D07', label: '终端电气化率', role: 'outcome' },
        { id: 'D10', label: '碳移除规模', role: 'input' }
      ],
      states: [
        { id: 'D01-high', descriptorId: 'D01', label: '高速' },
        { id: 'D01-mid', descriptorId: 'D01', label: '中速' },
        { id: 'D04-clean', descriptorId: 'D04', label: '快速清洁化' },
        { id: 'D07-high', descriptorId: 'D07', label: '高电气化' },
        { id: 'D10-large', descriptorId: 'D10', label: '大规模' }
      ],
      judgments: [], evidence: [], paths: [], mappings: []
    },
    selection: { descriptorIds: ['D01'], stateIds: [], lockedStateIds: [], nodeIds: [] }
  };
  return { ...base, ...overrides };
}

const ALLOWED_CONFIDENCE = new Set(['verified-in-file', 'documented-only']);

test('MODEL_MAPPINGS has 12 entries and every one carries the platform-inference status', () => {
  assert.equal(MODEL_MAPPINGS.length, 12);
  for (const mapping of MODEL_MAPPINGS) {
    assert.equal(mapping.platformStatus, 'platform-inference', mapping.descriptorId);
    assert.equal(mapping.provenanceLabel, MAPPING_STATUS_LABEL, mapping.descriptorId);
    assert.ok(ALLOWED_CONFIDENCE.has(mapping.confidence), mapping.descriptorId + ' 置信度取值超出证据文件');
  }
  // 编号连续且不重复：转写时丢一条或多一条都能在这里被抓到。
  assert.deepEqual(MODEL_MAPPINGS.map(item => item.descriptorId),
    ['D01', 'D02', 'D03', 'D04', 'D05', 'D06', 'D07', 'D08', 'D09', 'D10', 'D11', 'D12']);
});

test('MAPPING_PROVENANCE states the Chinese label and that no mentor reviewed it', () => {
  assert.equal(MAPPING_PROVENANCE.label, MAPPING_STATUS_LABEL);
  assert.equal(MAPPING_STATUS_LABEL, '平台推断、未经核对');
  assert.equal(MAPPING_PROVENANCE.status, 'platform-inference');
  assert.equal(MAPPING_PROVENANCE.reviewedByMentor, false);
  assert.equal(MAPPING_PROVENANCE.evidenceFile, 'mapping-evidence.json');
  assert.equal(MAPPING_PROVENANCE.evidenceWriteup, 'EVIDENCE.md');
  assert.ok(MAPPING_GAPS.length > 0);
  assert.ok(MAPPING_GAPS.some(gap => gap.includes('未经导师确认')));
});

test('mappingFor finds a known id and returns null for an unknown one', () => {
  const known = mappingFor('D01');
  assert.ok(known);
  assert.equal(known.descriptorLabel, '经济增长速度');
  assert.equal(known.sourceFile, 'gcam-china-release/input/gcamdata/inst/extdata/gcam-china/gdp_mil10usd_province.csv');
  assert.equal(known.unit, 'million 2010 USD');
  assert.equal(mappingFor('D99'), null);
  assert.equal(mappingFor(''), null);
  assert.equal(mappingFor(null), null);
});

test('inputCandidates excludes result-classified descriptors and documented-only / null sourceFile entries', () => {
  const ids = inputCandidates().map(item => item.descriptorId);
  // D04 与 D07 是结果型，不能作为输入。
  assert.ok(!ids.includes('D04'));
  assert.ok(!ids.includes('D07'));
  // D07 / D10 是仅文档型，D07 的 sourceFile 本来就是 null。
  assert.ok(!ids.includes('D10'));
  for (const mapping of inputCandidates()) {
    assert.ok(mapping.classification === 'input' || mapping.classification === 'parameter');
    assert.equal(typeof mapping.sourceFile, 'string');
    assert.ok(mapping.sourceFile.trim() !== '');
    assert.notEqual(mapping.confidence, 'documented-only');
  }
  // 三个输入型（D01/D03/D12）加六个可用参数型（D02/D05/D06/D08/D09/D11）。
  assert.equal(ids.length, 9);
  assert.deepEqual(ids, ['D01', 'D02', 'D03', 'D05', 'D06', 'D08', 'D09', 'D11', 'D12']);
});

test('buildModelInput succeeds for a mapped descriptor and copies unit, modelField and sourceFile from the mapping', () => {
  const mapping = mappingFor('D01');
  const result = buildModelInput({ descriptorId: 'D01', project: project(), stateId: 'D01-high', value: '12.5', note: '核对用' });
  assert.equal(result.ok, true, result.message ?? '');
  const sample = result.sample;
  assert.equal(sample.unit, mapping.unit);
  assert.equal(sample.modelField, mapping.modelField);
  assert.equal(sample.sourceFile, mapping.sourceFile);
  assert.equal(sample.confidence, mapping.confidence);
  assert.equal(sample.value, 12.5);
  assert.equal(sample.note, '核对用');
  // 项目范围与状态标签取自真实的项目数据，不是占位符。
  assert.equal(sample.project.regionId, '示例地区（非真实政策）');
  assert.deepEqual(sample.project.years, [2030, 2035]);
  assert.equal(sample.state.id, 'D01-high');
  assert.equal(sample.state.label, '高速');
});

test('buildModelInput refuses an unknown descriptor', () => {
  const result = buildModelInput({ descriptorId: 'D99', project: project(), stateId: 'D01-high', value: '1' });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'UNKNOWN_DESCRIPTOR');
  assert.ok(result.message.includes('证据文件里没有这个编号的映射'));
});

test('buildModelInput refuses a documented-only mapping even with a valid state and value', () => {
  const result = buildModelInput({ descriptorId: 'D10', project: project(), stateId: 'D10-large', value: '1' });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'DOCUMENTED_ONLY');
  assert.ok(result.message.includes('碳移除规模'));
});

test('buildModelInput refuses a blank value and never reads it as 0', () => {
  for (const value of ['', '   ', null, undefined]) {
    const result = buildModelInput({ descriptorId: 'D01', project: project(), stateId: 'D01-high', value });
    assert.equal(result.ok, false, '空值不应通过：' + String(value));
    assert.equal(result.code, 'BLANK_VALUE');
    assert.ok(result.message.includes('未填写不等于 0'));
  }
});

test('buildModelInput refuses when no state is selected', () => {
  for (const stateId of ['', null, undefined]) {
    const result = buildModelInput({ descriptorId: 'D01', project: project(), stateId, value: '1' });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'NO_STATE');
  }
  // 状态存在但不属于这个描述符：拒绝理由与「没有选择」分开。
  const wrong = buildModelInput({ descriptorId: 'D01', project: project(), stateId: 'D04-clean', value: '1' });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.code, 'UNKNOWN_STATE');
});

test('a value of 0 succeeds and the sample contains 0, distinct from blank', () => {
  const result = buildModelInput({ descriptorId: 'D01', project: project(), stateId: 'D01-high', value: 0 });
  assert.equal(result.ok, true, result.message ?? '');
  assert.equal(result.sample.value, 0);
  assert.notEqual(result.sample.value, null);
  // 字符串 '0' 同样是真实取值。
  const stringZero = buildModelInput({ descriptorId: 'D01', project: project(), stateId: 'D01-high', value: '0' });
  assert.equal(stringZero.ok, true, stringZero.message ?? '');
  assert.equal(stringZero.sample.value, 0);
  // 空值仍然是拒绝，说明 0 与未填写是两条读法。
  assert.equal(buildModelInput({ descriptorId: 'D01', project: project(), stateId: 'D01-high', value: '' }).ok, false);
});

test('the sample provenance block repeats 未经核对 and reviewedByMentor:false', () => {
  const result = buildModelInput({ descriptorId: 'D01', project: project(), stateId: 'D01-high', value: '3' });
  assert.equal(result.ok, true, result.message ?? '');
  const block = result.sample.provenance;
  assert.equal(block.label, '平台推断、未经核对');
  assert.ok(block.label.includes('未经核对'));
  assert.equal(block.reviewedByMentor, false);
  assert.equal(block.status, 'platform-inference');
  assert.equal(block.evidenceFile, 'mapping-evidence.json');
  assert.ok(block.note.includes('未经导师或同学确认'));
  // 序列化之后仍然带着这些字：样例脱离本页面也读得到映射性质。
  const text = sampleToJson(result.sample);
  assert.ok(text.includes('未经核对'));
  assert.ok(text.includes('"reviewedByMentor": false'));
});

test('sampleToJson and sampleToCsv round-trip the key fields', () => {
  const result = buildModelInput({ descriptorId: 'D09', project: project({ data: { ...project().data, states: [...project().data.states, { id: 'D09-big', descriptorId: 'D09', label: '大规模部署' }] } }), stateId: 'D09-big', value: '120', note: '含,逗号"引号' });
  assert.equal(result.ok, true, result.message ?? '');
  const sample = result.sample;

  const parsed = JSON.parse(sampleToJson(sample));
  assert.equal(parsed.descriptor.descriptorId, 'D09');
  assert.equal(parsed.modelField, sample.modelField);
  assert.equal(parsed.sourceFile, sample.sourceFile);
  assert.equal(parsed.unit, sample.unit);
  assert.equal(parsed.value, 120);
  assert.equal(parsed.state.label, '大规模部署');
  assert.equal(parsed.provenance.reviewedByMentor, false);
  assert.ok(sampleToJson(sample).endsWith('\n'));

  const csv = sampleToCsv(sample);
  const lines = csv.trimEnd().split('\r\n');
  assert.equal(lines.length, 2);
  assert.ok(lines[0].startsWith('描述符编号,描述符名称,分类,适用模型,模型字段,来源文件,单位,置信度'));
  const heads = lines[0].split(',');
  const cells = parseCsvLine(lines[1]);
  assert.equal(cells.length, heads.length);
  const at = head => cells[heads.indexOf(head)];
  assert.equal(at('描述符编号'), 'D09');
  assert.equal(at('来源文件'), sample.sourceFile);
  assert.equal(at('单位'), sample.unit);
  assert.equal(at('置信度'), sample.confidence);
  assert.equal(at('参数取值'), '120');
  assert.equal(at('研究地区'), '示例地区（非真实政策）');
  assert.equal(at('研究年份'), '2030、2035');
  assert.equal(at('状态名称'), '大规模部署');
  assert.equal(at('映射状态'), '平台推断、未经核对');
  assert.equal(at('导师已核对'), '否');
  // 含逗号与引号的备注必须整体落在同一个单元格里，不能把行拆坏。
  assert.equal(at('备注'), '含,逗号"引号');
});

test('MODEL_INPUT_FILENAME is the Chinese base name without an extension', () => {
  assert.equal(MODEL_INPUT_FILENAME, '模型输入样例');
  assert.ok(!MODEL_INPUT_FILENAME.includes('.'));
});

// 极简 CSV 行解析（只处理本模块产出的引号转义），用来验证含逗号/引号的备注没有被拆坏。
function parseCsvLine(line) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { cells.push(cell); cell = ''; }
    else cell += ch;
  }
  cells.push(cell);
  return cells;
}
