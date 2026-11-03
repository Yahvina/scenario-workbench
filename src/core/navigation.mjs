const item = (module, title, ready = false, objectId = null) => ({ module, title, ready, objectId });

export function navigationFor(perspective) {
  if (perspective === 'public') return [
    { title: '我的情景', items: [item('workspace', '项目与研究范围', true), item('elements', '描述符与状态', true), item('timeline', '政策实施路径', true), item('relationships', '影响关系', true), item('solver', '检验与解释', true), item('exports', '保存与报告')] }
  ];
  return [
    { title: '项目与资料', items: [item('workspace', '项目与研究范围', true), item('policy', '政策库与来源')] },
    { title: '政策关系建模', items: [item('elements', '政策要素设置', true), item('relationships', '专家关系输入', true), item('relationships', '关系矩阵生成', true, 'matrix'), item('review', '分歧分析与校核')] },
    { title: '情景与结果', items: [item('timeline', '政策实施路径', true), item('solver', '情景计算与研判', true), item('analysis', '结果可视化'), item('optimization', '政策组合优化'), item('exports', '报告导出')] },
    { title: '研究工具', items: [item('importance', 'AHP重要性判断'), item('ai-draft', 'AI草案'), item('knowledge', '知识库')] }
  ];
}

export function navigationItem(module, objectId) {
  return navigationFor('expert').flatMap(group => group.items).find(item => item.module === module && item.objectId === objectId);
}
