import {el} from '../../core/ui.mjs';
import {downloadJson} from '../exports/download.mjs';
import {evidenceChecklist} from './evidence-checklist.mjs';

export function evidencePanel(archive) {
  const report=evidenceChecklist(archive);
  const panel=el('details',{'data-evidence-checklist':'',class:'solver-evidence'},
    el('summary',{},'评分依据核验清单 · '+report.totals.usedDirections+' 个实际使用方向'));
  panel.append(el('p',{},'即使评分填齐且计算完成，也不表示依据已核验。以下只整理本次冻结记录的引用；论文或历史数据的内容仍需人工逐项核对。'),
    el('p',{},'冻结输入：'+report.year+' 年 · '+report.regionId+' · 项目修订 '+report.revision+'。'),
    el('p',{},'本次实际使用 '+report.totals.usedCells+' 格，其中 '+report.totals.zeroCells+' 格明确为0；'+report.totals.directionsWithRelationReferences+' 个方向含规律类引用，不据此认定其支持了具体评分。'));
  for(const row of report.rows){
    const detail=el('details',{},el('summary',{},row.sourceLabel+' → '+row.targetLabel+' · '+row.judgedCells+' 格 · '+row.tasks.length+' 项待核对'));
    detail.append(el('p',{},'冻结判断 '+row.judgmentId+' · v'+(row.version??'未知')+' · '+(row.reviewStatus==='reviewed'?'记录标为已审核，内容适用性仍待核对':'记录尚未标为已审核')));
    if(row.references.length)detail.append(el('ul',{},...row.references.map(ref=>el('li',{},
      (ref.exists?(ref.role==='scoring-method'?'评分方法引用':ref.role==='relation-candidate'?'规律类候选引用':ref.role==='policy-context'?'政策背景引用':'其他引用'):'缺失引用')+' · '+
      (ref.sourceId||ref.id)+' · 定位：'+(ref.locator||'未填写')))));
    else detail.append(el('p',{},'这条判断没有引用记录。'));
    detail.append(el('ol',{},...row.tasks.map(task=>el('li',{},task))));panel.append(detail);
  }
  panel.append(el('p',{},'同学负责资料、状态划分依据与评分证据核验；模型负责人审定计算条件、模型口径及结果解释。'),
    el('button',{class:'button',onclick:()=>downloadJson('评分依据核验清单_'+report.year+'.json',report)},'导出依据核验清单'));
  return panel;
}
