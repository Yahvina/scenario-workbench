// Offline region catalog for the home start page. Scope is deliberately narrow:
// only the Jing-Jin-Ji study scope, so the list never pretends to cover the country.
export const REGION_CATALOG = {
  source: '依据公开行政区划口径（GB/T 2260 省级与地级行政区代码体系）整理',
  checkedAt: '2026-11-04',
  onlineVerified: false,
  scopeNote: '本清单只收录京津冀研究口径，不是全国完整清单：不含其他省份的地级市，也不预置任何园区；其他地区请在「园区或自定义」中自行填写，自定义名称不会自动获得行政归属或数据可用性认证。'
};

export const YEAR_MIN = 1900;
export const YEAR_MAX = 2300;
export const TARGET_YEARS = Array.from({ length: 41 }, (_, index) => 2020 + index);

export const REGIONS = ['京津冀'];
export const PROVINCES = ['北京市', '天津市', '河北省'];

export const CITIES = {
  '北京市': ['东城区', '西城区', '朝阳区', '丰台区', '石景山区', '海淀区', '门头沟区', '房山区', '通州区', '顺义区', '昌平区', '大兴区', '怀柔区', '平谷区', '密云区', '延庆区'],
  '天津市': ['和平区', '河东区', '河西区', '南开区', '河北区', '红桥区', '东丽区', '西青区', '津南区', '北辰区', '武清区', '宝坻区', '滨海新区', '宁河区', '静海区', '蓟州区'],
  '河北省': ['石家庄市', '唐山市', '秦皇岛市', '邯郸市', '邢台市', '保定市', '张家口市', '承德市', '沧州市', '廊坊市', '衡水市']
};

export const REGION_SCALES = [
  { id: 'region', label: '区域', hint: '有明确口径的跨省区域' },
  { id: 'province', label: '省 / 直辖市', hint: '省级行政区' },
  { id: 'city', label: '市 / 区', hint: '先选所属省／直辖市，再选市或区' },
  { id: 'custom', label: '园区或自定义', hint: '清单未收录的范围自行填写；自定义名称不自动获得行政归属或数据可用性认证' }
];

export const SCALE_IDS = REGION_SCALES.map(scale => scale.id);

export function optionsForScale(scale, provinceId = null) {
  if (scale === 'region') return REGIONS.slice();
  if (scale === 'province') return PROVINCES.slice();
  if (scale === 'city') return citiesFor(provinceId);
  return [];
}

export function citiesFor(provinceId) {
  return (CITIES[provinceId] || []).slice();
}

export function provinceForRegion(regionId) {
  for (const [provinceId, cities] of Object.entries(CITIES)) if (cities.includes(regionId)) return provinceId;
  return null;
}

// A stored regionId that is not in the offline list keeps its original value and is
// shown as a custom range: nothing is renamed, migrated or silently dropped.
export function scaleForRegion(regionId) {
  if (regionId === null || regionId === undefined || regionId === '') return 'region';
  if (REGIONS.includes(regionId)) return 'region';
  if (PROVINCES.includes(regionId)) return 'province';
  return provinceForRegion(regionId) ? 'city' : 'custom';
}

export function scaleLabel(scaleId) {
  return REGION_SCALES.find(scale => scale.id === scaleId)?.label || scaleId;
}
