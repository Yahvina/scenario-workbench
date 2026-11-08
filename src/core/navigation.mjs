const item = (module, title, ready = false, objectId = null) => ({ module, title, ready, objectId });

export function navigationFor(perspective) {
  if (perspective === 'public') return [
    { title: '我的情景', items: [
      item('workspace', '开始研究', true),
      item('elements', '因素与年度方案', true),
      item('relationships', '关系评分', true),
      item('solver', '检验与结果', true),
      item('exports', '保存与导出', true)
    ] },
    { title: '工具与说明', items: [
      item('chain', '计算过程与依据', true),
      item('robustness', '稳健性检验', true),
      item('methods', '方法与帮助', true),
      item('about', '关于平台／版本说明', true)
    ] }
  ];
  return [
    { title: '项目与资料', items: [
      item('workspace', '项目与研究范围', true),
      item('elements', '政策要素设置', true),
      item('policy', '政策库与来源', true)
    ] },
    { title: '政策关系建模', items: [
      item('relationships', '专家关系输入', true),
      item('relationships', '关系矩阵生成', true, 'matrix'),
      item('review', '分析校核', true)
    ] },
    { title: '情景与结果', items: [
      item('timeline', '政策实施路径', true),
      item('solver', '情景计算与研判', true),
      item('analysis', '结果可视化', true),
      item('optimization', '政策组合优化'),
      item('exports', '保存与导出', true)
    ] },
    { title: '工具与说明', items: [
      item('chain', '计算过程与依据', true),
      item('robustness', '稳健性检验', true),
      item('methods', '方法与帮助', true),
      item('about', '关于平台／版本说明', true),
      item('importance', 'AHP重要性判断'),
      item('ai-draft', 'AI草案', true),
      item('knowledge', '知识库', true)
    ] }
  ];
}

export function navigationItem(module, objectId) {
  return navigationFor('expert').flatMap(group => group.items).find(item => item.module === module && item.objectId === objectId);
}



