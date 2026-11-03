import { createProjectStore } from '../core/project-store.mjs';

export const JJJ_DRAFT_CATALOG = [
  {
    "label": "经济与人口",
    "children": [
      {
        "label": "经济规模",
        "descriptors": [
          {
            "id": "d1",
            "label": "经济增长速度",
            "states": [
              "高速",
              "中速",
              "低速"
            ]
          }
        ]
      },
      {
        "label": "人口",
        "descriptors": [
          {
            "id": "d3",
            "label": "人口空间分布与收缩态势",
            "states": [
              "集聚增强",
              "平稳收缩",
              "加速收缩"
            ]
          }
        ]
      },
      {
        "label": "产业结构",
        "descriptors": [
          {
            "id": "d2",
            "label": "产业结构",
            "states": [
              "加速服务化",
              "稳步演进",
              "转型滞后"
            ]
          }
        ]
      }
    ]
  },
  {
    "label": "能源系统",
    "children": [
      {
        "label": "能源供给",
        "descriptors": [
          {
            "id": "d20",
            "label": "可再生价格干预强度",
            "states": [
              "补贴高",
              "补贴中",
              "补贴低"
            ]
          },
          {
            "id": "d21",
            "label": "可再生数量约束强度",
            "states": [
              "强约束",
              "现行节奏",
              "弱约束"
            ]
          },
          {
            "id": "d4",
            "label": "一次能源结构",
            "states": [
              "快速清洁化",
              "目标节奏",
              "推进迟缓"
            ]
          },
          {
            "id": "d5",
            "label": "区域电力互济强度",
            "states": [
              "强互济",
              "规划节奏",
              "弱互济"
            ]
          },
          {
            "id": "d6",
            "label": "本地可再生能源开发规模",
            "states": [
              "高开发",
              "目标节奏",
              "低开发"
            ]
          }
        ]
      },
      {
        "label": "能源需求",
        "descriptors": [
          {
            "id": "d7",
            "label": "终端电气化率",
            "states": [
              "高电气化",
              "中电气化",
              "低电气化"
            ]
          }
        ]
      }
    ]
  },
  {
    "label": "产业与技术",
    "children": [
      {
        "label": "工业工艺",
        "descriptors": [
          {
            "id": "d8",
            "label": "钢铁工艺路线",
            "states": [
              "短流程与氢冶金为主",
              "长流程为主"
            ]
          },
          {
            "id": "d13",
            "label": "单位产品能耗限额强度",
            "states": [
              "严格限额",
              "现行标准",
              "宽松执行"
            ]
          },
          {
            "id": "d14",
            "label": "工业节能改造强度",
            "states": [
              "深入推进",
              "按计划推进",
              "推进缓慢"
            ]
          }
        ]
      },
      {
        "label": "减排技术",
        "descriptors": [
          {
            "id": "d9",
            "label": "碳捕集利用与封存部署规模",
            "states": [
              "大规模",
              "中等",
              "小规模"
            ]
          },
          {
            "id": "d10",
            "label": "碳移除规模",
            "states": [
              "含工程化移除",
              "仅生态碳汇"
            ]
          }
        ]
      }
    ]
  },
  {
    "label": "终端部门",
    "children": [
      {
        "label": "建筑用能",
        "descriptors": [
          {
            "id": "d15",
            "label": "建筑能效标准强度",
            "states": [
              "超低能耗为主",
              "现行标准递进",
              "标准滞后"
            ]
          },
          {
            "id": "d16",
            "label": "清洁取暖替代强度",
            "states": [
              "全面替代",
              "分步替代",
              "局部替代"
            ]
          }
        ]
      },
      {
        "label": "交通用能",
        "descriptors": [
          {
            "id": "d22",
            "label": "新能源车价格干预强度",
            "states": [
              "干预强",
              "干预中",
              "干预弱"
            ]
          },
          {
            "id": "d23",
            "label": "新能源车数量约束强度",
            "states": [
              "严格约束",
              "现行标准",
              "宽松约束"
            ]
          },
          {
            "id": "d24",
            "label": "新能源车信息引导强度",
            "states": [
              "全面推行",
              "试点推行",
              "尚未推行"
            ]
          },
          {
            "id": "d17",
            "label": "新能源汽车渗透强度",
            "states": [
              "快速渗透",
              "目标节奏",
              "渗透迟缓"
            ]
          }
        ]
      }
    ]
  },
  {
    "label": "资源与环境",
    "children": [
      {
        "label": "水资源",
        "descriptors": [
          {
            "id": "d11",
            "label": "用水总量与结构",
            "states": [
              "总量下降且再生水占比高",
              "总量稳定",
              "总量增长"
            ]
          }
        ]
      }
    ]
  },
  {
    "label": "政策与治理",
    "children": [
      {
        "label": "区域协同",
        "descriptors": [
          {
            "id": "d12",
            "label": "京津冀协同机制强度",
            "states": [
              "协同强：目标趋同",
              "协同中：维持现状档位差",
              "协同弱：各走各的"
            ]
          }
        ]
      },
      {
        "label": "政策工具",
        "descriptors": [
          {
            "id": "d18",
            "label": "研发与示范投入强度",
            "states": [
              "大幅加码",
              "稳定增长",
              "投入收敛"
            ]
          },
          {
            "id": "d19",
            "label": "碳价水平与碳市场覆盖",
            "states": [
              "高位并扩围",
              "温和上行",
              "低位维持"
            ]
          }
        ]
      }
    ]
  }
];

export function createJJJDraftProject() {
  const p = createProjectStore('jjj-existing-draft').read();
  p.title = '京津冀低碳情景 · 已有描述符草案';
  p.scope = { regionId: '京津冀', years: [] };
  const base = { version: 1, provenance: { origin: 'import', sourceId: 'legacy-framework', locator: '_src/v15/src/app.js:TREE' } };
  for (const [gi, group] of JJJ_DRAFT_CATALOG.entries()) {
    const groupId = 'jjj-group-' + gi;
    p.data.taxonomy.push({ ...base, id: groupId, label: group.label, kind: 'category', parentIds: [], childIds: group.children.map((_, ci) => groupId + '-section-' + ci), descriptorIds: [], evidenceRefs: [] });
    for (const [ci, section] of group.children.entries()) {
      const sectionId = groupId + '-section-' + ci;
      p.data.taxonomy.push({ ...base, id: sectionId, label: section.label, kind: 'category', parentIds: [groupId], childIds: section.descriptors.map(d => 'jjj-node-' + d.id), descriptorIds: [], evidenceRefs: [] });
      for (const descriptor of section.descriptors) {
        const descriptorId = 'jjj-' + descriptor.id, nodeId = 'jjj-node-' + descriptor.id, evidenceId = 'jjj-source-' + descriptor.id;
        const evidenceRefs = [evidenceId];
        p.data.evidence.push({ ...base, id: evidenceId, kind: 'user-assumption', sourceId: 'legacy-framework', locator: '_src/v15/src/app.js:TREE/' + descriptor.id, excerpt: '来自旧版已有描述符框架，未重新核验。描述符：' + descriptor.label + '；原状态名称：' + descriptor.states.join('、') + '。不表示状态阈值或关系评分已有可靠依据。', reviewStatus: 'draft' });
        p.data.taxonomy.push({ ...base, id: nodeId, label: descriptor.label, kind: 'category', parentIds: [sectionId], childIds: [], descriptorIds: [descriptorId], evidenceRefs });
        const stateIds = descriptor.states.map((_, si) => descriptorId + '-state-' + si);
        p.data.descriptors.push({ ...base, id: descriptorId, label: descriptor.label, role: 'context', stateIds, evidenceRefs });
        descriptor.states.forEach((label, si) => p.data.states.push({ ...base, id: stateIds[si], descriptorId, label, range: null, unit: null, validYears: [], scope: { regionId: '京津冀' }, evidenceRefs }));
      }
    }
  }
  return p;
}
