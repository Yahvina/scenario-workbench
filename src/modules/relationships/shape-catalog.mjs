// 纯展示辅助：缩略图、坐标轴说明与趋势大类示意图。
// It renders shapes only. It never produces a score, never writes a judgment and
// never decides whether a template is usable -- that stays in curve.mjs.
import {curveData} from './curve-data.mjs';

const NS='http://www.w3.org/2000/svg';

// Fig.2 panel glyphs. Coordinates mirror the paper's qualitative direction only:
// these are orientation sketches, not calibrated curves. Drawn in a 200x145 box
// where y grows downward, so y=25 is the top of the plot and y=105 the bottom.
export const PANEL_GLYPHS={
  A:'M25 105L170 25',
  B:'M25 25L170 105',
  C:'M25 105H90L170 25',
  D:'M25 105L90 25H170',
  E:'M25 105Q140 105 170 25',
  F:'M25 105Q50 25 170 25',
  G:'M25 25H90L170 105',
  H:'M25 25L90 105H170',
  I:'M25 25Q140 25 170 105',
  J:'M25 25Q50 105 170 105',
  K:'M25 25Q100 150 170 25',
  L:'M25 105Q100 -20 170 105'
};

export const AXIS_NOTE='横轴为源因素水平，纵轴为目标因素水平；两轴都不是公历年，也不是CIB分值坐标。';
export const SKETCH_NOTE='缩略图只示意图形方向，不是数值拟合，也不能从像素斜率推分数；实际分数严格查原论文Table 1。';

// The line-type vocabulary is transcribed from the paper, so it can be stated as
// fact; the low/high source-segment wording for K/L is the paper's own split.
export function lineTypeText(template) {
  const choices=template.lineChoices;
  if(choices.length===1)return '线型 '+choices[0]+'（'+(choices[0]===1?'较弱':'较强')+'）';
  return '线型 '+choices.join('、')+'（低源段用'+choices[0]+'，高源段用'+choices[1]+'）';
}

export function panels() {
  return curveData.panels.map(panel=>({...panel,templates:curveData.templates.filter(t=>t.panel===panel.id)}));
}

export function panelById(id) {
  return curveData.panels.find(panel=>panel.id===id)||null;
}

function svgNode(name,attrs) {
  const node=document.createElementNS(NS,name);
  for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));
  return node;
}

// `emphasis` draws the source-side half heavier; it is used only to distinguish
// the low-source and high-source segment split that the paper's line choice
// already encodes, never to imply a numeric slope.
export function thumbnail(panelId,{width=132,emphasis=null}={}) {
  const svg=svgNode('svg',{viewBox:'0 0 200 145',width,role:'img','aria-hidden':'true',focusable:'false',class:'shape-thumb'});
  svg.style.maxWidth='100%';
  svg.append(svgNode('line',{x1:20,y1:120,x2:182,y2:120,stroke:'var(--line2)','stroke-width':1}));
  svg.append(svgNode('line',{x1:20,y1:120,x2:20,y2:12,stroke:'var(--line2)','stroke-width':1}));
  const d=PANEL_GLYPHS[panelId];
  if(d){
    const path=svgNode('path',{d,fill:'none',stroke:'var(--tx2)','stroke-width':2,'stroke-linecap':'round'});
    svg.append(path);
  }
  return svg;
}

// 八个趋势大类：只用于逐行判断时作参考，不参与编码、不生成分数、不改选型。


export const MENTOR_GLYPHS={
  'mentor-1':'M25 105L170 25',
  'mentor-2':'M25 25L170 105',
  'mentor-3':'M25 100H85L170 25',
  'mentor-4':'M25 105Q120 30 170 30',
  'mentor-5':'M25 25Q100 150 170 25',
  'mentor-6':'M25 105Q100 -20 170 105',
  'mentor-7':'M25 100Q70 92 170 25',
  'mentor-8':'M25 45Q70 53 170 105'
};

export const MENTOR_SHAPES=[
  {id:'mentor-1',label:'正向增强',parenthetical:'单调上升',glyphClass:'上升折线'},
  {id:'mentor-2',label:'负向抑制',parenthetical:'单调下降',glyphClass:'下降折线'},
  {id:'mentor-3',label:'阈值效应',parenthetical:'存在拐点',glyphClass:'后段陡升折线'},
  {id:'mentor-4',label:'饱和效应',parenthetical:'边际递减',glyphClass:'先陡后平折线'},
  {id:'mentor-5',label:'U型关系',parenthetical:'先降后升',glyphClass:'对称U形'},
  {id:'mentor-6',label:'倒U型关系',parenthetical:'先升后降',glyphClass:'倒U形'},
  {id:'mentor-7',label:'非线性增强',parenthetical:'加速上升',glyphClass:'下凸折线'},
  {id:'mentor-8',label:'非线性抑制',parenthetical:'加速下降',glyphClass:'上凸折线'}
];

