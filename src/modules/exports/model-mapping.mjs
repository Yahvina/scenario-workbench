// P9 模型输入样例：把本平台的描述符接到下游模型（GCAM-China / CHEER）的真实文件上。
// 这份映射的性质是唯一的重点：本机没有任何导师确认过的参数表，现有映射是平台侧逐条打开
// 真实模型文件比对出来的（见 docs/research/model-export/mapping-evidence.json 与 EVIDENCE.md）。
// 因此本模块只提供两件事：
// 1. 忠实转写证据文件里的描述符映射与未核到项，一个字都不补、不改写、不把 null 填成别的值；
// 2. 用这份映射生成可下载的输入样例，并把「平台推断、未经核对」写进样例本身，
//    使样例离开本页面后也不会被误当成已核对的参数表。
// 三条不越过的边界：
// - 只认证据文件里有的内容：未核到的写 null，宁可让样例生成失败，也不编模型字段、单位、路径或数字。
// - 未填写与 0 严格分开：空值是「未填写」，一律拒绝；调用方传进来的 0 是真实取值，必须原样通过。
// - 结果型（result）与仅文档型（documented-only）不进候选，生成时也逐个拒绝，
//   因为它们不能作为模型输入，也不该在界面上被当成可用参数。
// 本模块是纯函数：不碰 DOM、不联网、不读文件、不写控制台。

// 证据文件与说明文件都放在同一目录；引用它们是为了让样例能回指到唯一的来源。
const EVIDENCE_DIR = 'docs/research/model-export/';
const EVIDENCE_FILE = 'mapping-evidence.json';
const EVIDENCE_WRITEUP = 'EVIDENCE.md';

// 状态标签是硬约定：界面、样例文件与 CSV 都必须出现同一句话，改文案就要同时改这里三处调用点。
export const MAPPING_STATUS_LABEL = '平台推断、未经核对';

export const MAPPING_PROVENANCE = {
  status: 'platform-inference',
  reviewedByMentor: false,
  label: MAPPING_STATUS_LABEL,
  evidenceDir: EVIDENCE_DIR,
  evidenceFile: EVIDENCE_FILE,
  evidenceWriteup: EVIDENCE_WRITEUP,
  // 证据文件自己声明了它核过什么、没核什么，这里原样带上，便于样例被单独打开时仍能自证范围。
  verifiedAgainst: '本会话用真实命令列目录/统计数量/读取 CSV 头部得到：gcam-china-release/exe/ 下 configuration*.xml 共 7 个；input/gcamdata/xml/ 304 个 XML；input/gcamdata/inst/extdata/ 1112 个 CSV（合计 384221209 字节）；input/gcamdata/inst/extdata/gcam-china/ 157 个 CSV；input/policy/ 55 个文件；input/extra/ 5 个文件；cheer/CHEER-Clean 39 个文件。所有 sourceFile 字段均已由 os.walk 命中并记录 os.path.getsize 字节数。',
  note: '本映射由平台侧逐条打开真实模型文件比对得出，核过的是「文件是否存在、单位是否如此」，未核「状态档位如何换算成模型取值」。未经导师或同学确认，不得以「已核对」的表述提交或引用。'
};

// 逐条转写 mapping-evidence.json 的 descriptors（顺序、用词、标点、null 一律保留）。
// 每条额外带上平台侧的状态标记：整份映射只有这一种性质，写成每条自带，是为了让任何一条
// 被单独取出时都带着「平台推断、未经核对」，不会因为脱离数组就变成无标记的映射。
export const MODEL_MAPPINGS = [
  {
    descriptorId: 'D01',
    descriptorLabel: '经济增长速度',
    classification: 'input',
    model: 'both',
    modelField: 'GDP by province (gdp_mil10usd_province.csv)；GDP growth rates (IMF_growth_rates.csv)；CHEER 侧为 TFP / tfp0 与 labor_g 趋势参数',
    sourceFile: 'gcam-china-release/input/gcamdata/inst/extdata/gcam-china/gdp_mil10usd_province.csv',
    unit: 'million 2010 USD',
    conversionNote: '情景设定的经济增速先换算为分省 GDP 绝对值序列（百万 2010 美元）；CHEER-P 侧需改写为全要素生产率增长率，而非 GDP 本身。',
    confidence: 'verified-in-file',
    boundary: '只证明该 CSV 承载分省 GDP 且单位可读；不证明「增长速度」这一状态档位如何映射到具体 GDP 数值，也不证明 CHEER 的 TFP 参数已被本平台正确换算。',
    platformStatus: 'platform-inference',
    provenanceLabel: MAPPING_STATUS_LABEL
  },
  {
    descriptorId: 'D02',
    descriptorLabel: '产业结构',
    classification: 'parameter',
    model: 'both',
    modelField: 'Detailed industry coefficient (IO_detailed_industry.csv)；Detailed industry output (detailed_industry_output.csv)；收入弹性 iron_steel_income_elas / industry_income_elas 等配置项',
    sourceFile: 'gcam-china-release/input/gcamdata/inst/extdata/gcam-china/IO_detailed_industry.csv',
    unit: 'GJ/kg or GJ/GJ',
    conversionNote: '产业结构的「份额」状态需改写为部门投入产出系数与终端需求收入弹性文件引用（configuration 中的 *_income_elas 项），部门增加值份额本身不是模型输入。',
    confidence: 'verified-in-file',
    boundary: '只证明投入产出系数文件存在且单位可读；未核到「产业结构三档状态」到具体弹性/系数取值的换算规则。',
    platformStatus: 'platform-inference',
    provenanceLabel: MAPPING_STATUS_LABEL
  },
  {
    descriptorId: 'D03',
    descriptorLabel: '人口空间分布与收缩态势',
    classification: 'input',
    model: 'both',
    modelField: 'Population by province (population_thous_province.csv)；Urban population fraction (urban_pop_share_province_Yh.csv)；Population growth rates (Population_Growth_Rates.csv)',
    sourceFile: 'gcam-china-release/input/gcamdata/inst/extdata/gcam-china/population_thous_province.csv',
    unit: '1000 persons',
    conversionNote: '分省人口序列直接作为外生输入；CHEER-P 侧需改写为分省劳动力供给。',
    confidence: 'verified-in-file',
    boundary: '只证明分省人口总量文件存在且单位可读；城镇人口占比文件单位为 NA（未标单位），「收缩态势」的判定阈值不在模型文件中。',
    platformStatus: 'platform-inference',
    provenanceLabel: MAPPING_STATUS_LABEL
  },
  {
    descriptorId: 'D04',
    descriptorLabel: '一次能源结构',
    classification: 'result',
    model: 'both',
    modelField: 'energy balance by province (en_balance_Mtce_Yh_province.csv)',
    sourceFile: 'gcam-china-release/input/gcamdata/inst/extdata/gcam-china/en_balance_Mtce_Yh_province.csv',
    unit: 'Mtce',
    conversionNote: '不宜作为输入。该文件是模型读取的基准年能源平衡表，未来年份的一次能源结构由模型按碳价与技术成本求解得到，属输出侧指标。',
    confidence: 'verified-in-file',
    boundary: '文件本身是输入侧的历史/基准能源平衡表，不能据此断言模型未来的能源结构结果格式；「快速清洁化/目标节奏/推进迟缓」三档状态未在模型语言中定义。',
    platformStatus: 'platform-inference',
    provenanceLabel: MAPPING_STATUS_LABEL
  },
  {
    descriptorId: 'D05',
    descriptorLabel: '区域电力互济强度',
    classification: 'parameter',
    model: 'GCAM-China',
    modelField: 'Intraprovince electricity trade (ABSPI_intra_province_electricity_trade.csv)；省级—电网区归属 province_names_mappings.csv 的 grid.region 字段',
    sourceFile: 'gcam-china-release/input/gcamdata/inst/extdata/gcam-china/ABSPI_intra_province_electricity_trade.csv',
    unit: 'GWh',
    conversionNote: '「互济强度」需改写为电网间输电能力与输电成本参数；实际交易量是模型结果。京津冀三地在本文件中同属 North China Grid（已核 BJ/HE/TJ 三行）。',
    confidence: 'verified-in-file',
    boundary: '只证明省间电力交易历史数据与 6 个电网区归属存在；未核到「输电能力/输电成本」参数的独立承载文件，也未核到省际输电通道参数表。',
    platformStatus: 'platform-inference',
    provenanceLabel: MAPPING_STATUS_LABEL
  },
  {
    descriptorId: 'D06',
    descriptorLabel: '本地可再生能源开发规模',
    classification: 'parameter',
    model: 'both',
    modelField: 'Wind power potential and base costs by province (wind_potential_province.csv)；Solar PV power potential and base costs (solar_potential_province.csv)；Planned hydro electricity generation (future_hydro_gen_EJ.csv)',
    sourceFile: 'gcam-china-release/input/gcamdata/inst/extdata/gcam-china/wind_potential_province.csv',
    unit: 'Potential units: EJ; price units: $2007/kWh',
    conversionNote: '装机规模是模型结果；外生输入是分省资源潜力曲线加基准成本。状态「规模」需改写为潜力曲线与成本路径。',
    confidence: 'verified-in-file',
    boundary: '只证明风光潜力与成本、水电计划发电量文件存在且单位可读；地热资源潜力未在 gcam-china/ 目录中找到同名文件，未核到。',
    platformStatus: 'platform-inference',
    provenanceLabel: MAPPING_STATUS_LABEL
  },
  {
    descriptorId: 'D07',
    descriptorLabel: '终端电气化率',
    classification: 'result',
    model: 'both',
    modelField: null,
    sourceFile: null,
    unit: null,
    conversionNote: '不宜作为输入。由终端用能技术的 logit 份额选择决定，属模型结果；本会话在 gcam-china/ 目录 157 个 CSV 中检索 electr/electrif/elec_share/terminal 均无终端电气化率专用文件，佐证其为派生量。',
    confidence: 'documented-only',
    boundary: '「未找到对应文件」只证明该目录下没有以终端电气化率命名的输入文件，不等于模型内部不存在该派生量，也不等于 CHEER 侧无对应口径。',
    platformStatus: 'platform-inference',
    provenanceLabel: MAPPING_STATUS_LABEL
  },
  {
    descriptorId: 'D08',
    descriptorLabel: '钢铁工艺路线',
    classification: 'parameter',
    model: 'both',
    modelField: 'Detailed industry coefficient (IO_detailed_industry.csv)；NBS 流程映射 NBS_CESY_process.csv；钢铁贸易调整文件 trade_iron_steel_China_offset.xml；CHEER-CLEAN 电力/钢铁工艺拆分见 参数说明.xlsx「模型结构」与「替代弹性-EPPA」表',
    sourceFile: 'gcam-china-release/input/extra/trade_iron_steel_China_offset.xml',
    unit: null,
    conversionNote: 'BOF/EAF 两种工艺需改写为成本、效率参数与技术份额权重；对应的收入弹性配置项为 iron_steel_income_elas（SSP1/SSP2 取值不同，已核）。',
    confidence: 'verified-in-file',
    boundary: 'XML 为贸易调整文件，非 BOF/EAF 工艺参数表本身；未核到独立的钢铁工艺成本/效率参数文件，工艺拆分口径在 GCAM 侧未直接落文件。',
    platformStatus: 'platform-inference',
    provenanceLabel: MAPPING_STATUS_LABEL
  },
  {
    descriptorId: 'D09',
    descriptorLabel: 'CCUS 部署规模',
    classification: 'parameter',
    model: 'GCAM-China',
    modelField: 'CO2 and Cost by province (CCS_provincial_data.csv)；unallocated CO2 storage by province (unallocated_CStorage_province.csv)；Total CCS capacity from TU study (CCS_potential_TU_Scailing.csv)；cost grades 补丁 CCS_provincial_data_add.csv',
    sourceFile: 'gcam-china-release/input/gcamdata/inst/extdata/gcam-china/CCS_provincial_data.csv',
    unit: 'CO2-Mt,Cost-2005USD per t CO2',
    conversionNote: '部署规模是模型结果；外生输入是分省封存潜力曲线与 CCS 技术成本。配置项 ccs 在 SSP1 取 ccs_supply_lowest.xml、SSP2 取 ccs_supply_low.xml（已核差异）。',
    confidence: 'verified-in-file',
    boundary: '只证明分省封存潜力与成本文件存在且单位可读；CCS 技术成本曲线本身的承载 XML 未逐项打开，潜力口径（2005USD vs 1990USD）在不同文件间不一致，换算关系未核。',
    platformStatus: 'platform-inference',
    provenanceLabel: MAPPING_STATUS_LABEL
  },
  {
    descriptorId: 'D10',
    descriptorLabel: '碳移除规模',
    classification: 'parameter',
    model: 'GCAM-China',
    modelField: 'A_resbio_curves.csv（Residue biomass fraction produced by price）；Various_ag_resbio_data.csv（Residue biomass characteristics by crop type）；Various_CarbonData_LTsage.csv（Assumed vegetation carbon content by land use type and AEZ）',
    sourceFile: 'gcam-china-release/input/gcamdata/inst/extdata/aglu/A_resbio_curves.csv',
    unit: 'NA',
    conversionNote: '碳移除经土地利用与生物质两条线进入模型；「规模」需改写为生物质原料潜力加造林减排成本曲线加土地利用假设。',
    confidence: 'documented-only',
    boundary: '源 docx 只给出「extdata/aglu/ 土地利用数据、生物质潜力相关文件」的目录级说法，未点名具体文件；上述三文件为本会话按 aglu 目录内容推断的相关文件，A_resbio_curves.csv 头部单位即为 NA，造林减排成本曲线本身未在文件中核到。',
    platformStatus: 'platform-inference',
    provenanceLabel: MAPPING_STATUS_LABEL
  },
  {
    descriptorId: 'D11',
    descriptorLabel: '用水总量与结构',
    classification: 'parameter',
    model: 'GCAM-China',
    modelField: 'china water withdrawal and consumption for industry (water_km3_china_ind_Yh.csv)；average electricity water coefficient by China provinces (electricity_water_coef_CHINA.csv)；china_seawater_provinces_basins.csv',
    sourceFile: 'gcam-china-release/input/gcamdata/inst/extdata/gcam-china/water_km3_china_ind_Yh.csv',
    unit: 'km3',
    conversionNote: '取水量是模型结果；外生输入是分省取水约束或水价。火电耗水系数单位为 m^3/GJ（已核 electricity_water_coef_CHINA.csv 头部）。',
    confidence: 'verified-in-file',
    boundary: '只证明分省工业取水与电力耗水系数文件存在且单位可读；「取水约束或水价」参数本身的承载文件未核到，次国家级水模块的省级约束文件未打开。',
    platformStatus: 'platform-inference',
    provenanceLabel: MAPPING_STATUS_LABEL
  },
  {
    descriptorId: 'D12',
    descriptorLabel: '京津冀协同机制强度',
    classification: 'input',
    model: 'both',
    modelField: 'State codes-names-groupings mappings (provinces_subregions.csv)；Province alternate names mapping，含 subregion / climate.region / grid.region 字段 (province_names_mappings.csv)',
    sourceFile: 'gcam-china-release/input/gcamdata/inst/extdata/gcam-china/province_names_mappings.csv',
    unit: 'NA',
    conversionNote: '协同机制需落为差异化政策设置（各省不同的碳价、配额或补贴），或碳定价收入的央地归属；本文件提供省—subregion—气候区—电网区的层级归属（已核 33 个省级条目、6 个电网区，京津冀三地均属 North China Grid）。',
    confidence: 'verified-in-file',
    boundary: '只证明省—电网区归属映射存在；「协同机制强度」本身没有对应的模型参数文件，省级政策模块（GCAM-China v8 新增）的具体政策文件未逐个核到。',
    platformStatus: 'platform-inference',
    provenanceLabel: MAPPING_STATUS_LABEL
  }
];

// 未核到的东西按原顺序转写：这份清单和映射同等重要，界面必须把它显示在样例旁边，
// 否则「平台推断」就只剩一句标签，看不到推断的具体窟窿在哪里。
export const MAPPING_GAPS = [
  'D07 终端电气化率在 gcam-china/ 目录 157 个 CSV 中无专用输入文件（检索 electr/electrif/elec_share/terminal 均空），只能按结果型处理；CHEER 侧是否另有口径未核。',
  'D10 碳移除规模：源 docx 只给到 aglu/ 目录级，未点名文件；本会话按目录内容推断的 A_resbio_curves.csv 等单位即为 NA，造林减排成本曲线未在任何打开的文件中核到。',
  'D08 钢铁 BOF/EAF 工艺的成本、效率、份额权重参数无独立文件；仅核到贸易调整 XML 与投入产出系数文件。',
  'D05 电网间输电能力与输电成本参数无承载文件；只核到历史省间交易量（GWh）。',
  'D11 分省取水约束或水价参数无承载文件；只核到历史取水量与耗水系数。',
  'D06 地热资源潜力文件未在 gcam-china/ 目录找到（源 docx 称 geo_adv.xml 属 SSP1 配置项，本会话在 configuration_china_ssp1.xml 中核到该引用，但未打开该指令文件本身）。',
  'CHEER 无法运行：GAMS 为商业软件需授权，本机未找到 gams 可执行文件与任何 .lic/gamslice.txt，因此 CHEER 侧参数只能按源码与 参数说明.xlsx 阅读，未经运行验证。',
  'CHEER-Clean 目录实际为 39 个文件，与源 docx 所称「47 个文件」不一致；CHEER 官网所称 Python 版本未在该包中出现（包内无 .py 文件），Python 版本未核。',
  'gcam-china/ 的 gcam-china 目录实际 CSV 数为 157，与源 docx 所称「160 个 CSV 文件」不一致。',
  'configuration.xml 的 ScenarioComponents 区块实测为 115 条 Value 条目（源 docx 称 113 个）；configuration_china_ssp1.xml 为 116 条、ssp2 为 110 条；SSP1 与 SSP2 实测差异为 21 个参数项（源 docx 称 23 个）。数值差异未追到原因。',
  'extdata 下单位核实仅限于本会话打开头部的那批 CSV；未逐个打开全部 1112 个 CSV 的单位行。',
  'CHEER-P-demo 的 trend.gms 不存在（实际为 trend.gdx 等数据文件），CHEER-P 侧的 TFP/劳动力趋势字段只核到 parshock.gms 中的 tfp0。',
  'USDA_GDP_MER.csv（源 docx 4.1 节列出的关键文件）在 extdata 下未找到，只核到 Maddison_population.csv、UN_popTot.csv、pwt91.csv、SSP_database_2024.csv.gz。',
  '本映射为平台侧推断并逐条比对真实文件所得，未经导师确认，不得以「已核对」表述提交给导师。'
];

// 可下载样例的基名；扩展名由调用方决定（.json / .csv）。
export const MODEL_INPUT_FILENAME = '模型输入样例';

const hasText = value => typeof value === 'string' && value.trim() !== '';
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
// 空值口径：null / undefined / 空串 / 纯空白都算「未填写」。0 与 '0' 不在此列，它们是真实取值。
const isBlank = value => value === null || value === undefined || (typeof value === 'string' && value.trim() === '');

// 中文拒绝原因逐条分开：用户要做的下一步并不一样。
export const MODEL_INPUT_ERRORS = {
  UNKNOWN_DESCRIPTOR: '证据文件里没有这个编号的映射',
  DOCUMENTED_ONLY: '这条映射只有文档级说法，没有落到具体模型文件',
  NO_SOURCE_FILE: '这条映射没有核到承载文件',
  NO_PROJECT: '当前项目不可读',
  NO_STATE: '没有选择状态',
  UNKNOWN_STATE: '所选状态不属于这个描述符',
  BLANK_VALUE: '参数取值为空',
  INVALID_VALUE: '参数取值不是有限数字',
  UNIT_NOT_IN_EVIDENCE: '映射单位为空，不接受自行填写的单位',
  UNIT_MISMATCH: '声明单位与证据文件不一致'
};

export function mappingFor(descriptorId) {
  if (!hasText(descriptorId)) return null;
  return MODEL_MAPPINGS.find(mapping => mapping.descriptorId === descriptorId) || null;
}

// 候选只收「能当模型输入用」的映射：分类是 input 或 parameter，且核到了真实承载文件，
// 且不是仅文档型。结果型（D04/D07）与仅文档型（D07/D10）一律不进候选——
// 它们即便出现在下拉框里也生成不出样例，列出来只会让人以为可用。
export function inputCandidates() {
  return MODEL_MAPPINGS.filter(mapping =>
    (mapping.classification === 'input' || mapping.classification === 'parameter') &&
    hasText(mapping.sourceFile) &&
    mapping.confidence !== 'documented-only');
}

function refuse(code, detail) {
  return { ok: false, code, message: MODEL_INPUT_ERRORS[code] + '：' + detail };
}

// 生成一份可下载的模型输入样例。
// 拒绝顺序固定：先看映射本身能不能用（编号、仅文档型、无承载文件），再看项目与状态是否齐备，
// 最后才看取值。这样界面拿到的第一条原因总是最靠近根因的那条。
export function buildModelInput({descriptorId, project, stateId, value, unit, note} = {}) {
  const mapping = mappingFor(descriptorId);
  if (!mapping) return refuse('UNKNOWN_DESCRIPTOR', hasText(descriptorId) ? descriptorId : '（未指定编号）');
  if (mapping.confidence === 'documented-only') return refuse('DOCUMENTED_ONLY', mapping.descriptorLabel + '（' + mapping.descriptorId + '）');
  if (!hasText(mapping.sourceFile)) return refuse('NO_SOURCE_FILE', mapping.descriptorLabel + '（' + mapping.descriptorId + '）');
  if (!isObject(project)) return refuse('NO_PROJECT', '无法从项目里读范围与状态');

  const states = Array.isArray(project.data?.states) ? project.data.states : [];
  const candidates = states.filter(state => state?.descriptorId === mapping.descriptorId);
  if (isBlank(stateId)) {
    return refuse('NO_STATE', candidates.length
      ? '请先选择「' + mapping.descriptorLabel + '」的一个状态'
      : '当前项目里没有「' + mapping.descriptorLabel + '」的状态定义，请先在因素与方案里定义');
  }
  const state = candidates.find(item => item.id === stateId) || null;
  if (!state) return refuse('UNKNOWN_STATE', String(stateId) + '（该描述符只有 ' + (candidates.length ? candidates.map(item => item.id).join('、') : '0') + ' 个状态）');

  // 未填写与 0 是两条读法：空值拒绝，0 通过。这里只做一次判定，后面统一用数值。
  if (isBlank(value)) return refuse('BLANK_VALUE', '未填写不等于 0，请填入实际取值或明确填写 0');
  const numeric = Number(typeof value === 'string' ? value.trim() : value);
  if (!Number.isFinite(numeric)) return refuse('INVALID_VALUE', String(value));

  // 调用方若声明了单位，只允许与证据文件一致；证据里单位为空时不接受另外填写，避免自己造单位。
  const declared = hasText(unit) ? unit.trim() : null;
  if (declared !== null) {
    if (!hasText(mapping.unit)) return refuse('UNIT_NOT_IN_EVIDENCE', '证据文件里这条映射的单位为空，不能自行补一个单位');
    if (declared !== mapping.unit) return refuse('UNIT_MISMATCH', '映射单位「' + mapping.unit + '」，声明单位「' + declared + '」');
  }

  const scope = isObject(project.scope) ? project.scope : {};
  const years = Array.isArray(scope.years) ? scope.years.filter(year => typeof year === 'number' && Number.isFinite(year)) : [];
  const sample = {
    schemaVersion: 1,
    kind: 'model-input-sample',
    // 来源声明放在最前面：样例被单独打开、转发或粘进别的文档时，这几行必须跟着它走。
    provenance: {
      status: MAPPING_PROVENANCE.status,
      label: MAPPING_PROVENANCE.label,
      reviewedByMentor: MAPPING_PROVENANCE.reviewedByMentor,
      evidenceFile: MAPPING_PROVENANCE.evidenceFile,
      evidenceWriteup: MAPPING_PROVENANCE.evidenceWriteup,
      note: MAPPING_PROVENANCE.note
    },
    confidence: mapping.confidence,
    descriptor: {
      descriptorId: mapping.descriptorId,
      descriptorLabel: mapping.descriptorLabel,
      classification: mapping.classification,
      model: mapping.model
    },
    // 模型字段、来源文件、单位三项一律取自证据文件，不从界面取、不做归一化改写。
    modelField: mapping.modelField,
    sourceFile: mapping.sourceFile,
    unit: mapping.unit,
    project: {
      id: hasText(project.id) ? project.id : null,
      title: hasText(project.title) ? project.title : null,
      regionId: hasText(scope.regionId) ? scope.regionId : null,
      years
    },
    state: {id: state.id, label: hasText(state.label) ? state.label : null},
    value: numeric,
    note: hasText(note) ? note.trim() : null,
    conversionNote: mapping.conversionNote,
    boundary: mapping.boundary
  };
  return {ok: true, sample};
}

export function sampleToJson(sample) {
  return JSON.stringify(sample, null, 2) + '\n';
}

// CSV 只输出一行数据：键与值都是单行文本，多值用顿号连接，便于人工核对与再粘贴。
// 置信度按证据文件原样写出（verified-in-file / documented-only），不翻译成容易被读成「已核对」的中文。
const CSV_COLUMNS = [
  ['描述符编号', sample => sample?.descriptor?.descriptorId],
  ['描述符名称', sample => sample?.descriptor?.descriptorLabel],
  ['分类', sample => sample?.descriptor?.classification],
  ['适用模型', sample => sample?.descriptor?.model],
  ['模型字段', sample => sample?.modelField],
  ['来源文件', sample => sample?.sourceFile],
  ['单位', sample => sample?.unit],
  ['置信度', sample => sample?.confidence],
  ['项目编号', sample => sample?.project?.id],
  ['项目标题', sample => sample?.project?.title],
  ['研究地区', sample => sample?.project?.regionId],
  ['研究年份', sample => (Array.isArray(sample?.project?.years) && sample.project.years.length ? sample.project.years.join('、') : null)],
  ['状态编号', sample => sample?.state?.id],
  ['状态名称', sample => sample?.state?.label],
  ['参数取值', sample => (sample?.value === null || sample?.value === undefined ? null : sample.value)],
  ['备注', sample => sample?.note],
  ['映射状态', sample => sample?.provenance?.label],
  ['导师已核对', sample => (sample?.provenance?.reviewedByMentor === true ? '是' : '否')],
  ['证据文件', sample => sample?.provenance?.evidenceFile],
  ['换算说明', sample => sample?.conversionNote],
  ['适用边界', sample => sample?.boundary]
];

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

export function sampleToCsv(sample) {
  const rows = [
    CSV_COLUMNS.map(([head]) => csvCell(head)).join(','),
    CSV_COLUMNS.map(([, read]) => csvCell(read(sample))).join(',')
  ];
  return rows.join('\r\n') + '\r\n';
}
