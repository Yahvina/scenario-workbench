// H2 pure-display helper: thumbnails, axis notes and the mentor reference list.
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
export const MENTOR_SECTION_TITLE='导师原型参考图形（待核，仅供浏览）';

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

// ---- mentor reference -------------------------------------------------------
// Everything here is display-only reference. Selecting one of these shapes must
// not write a judgment, must not generate a four-cell score and must not change
// the current template selection. The recorded evidence for the only located
// mentor figure is a generated prototype image, not a paper figure, so each entry
// keeps its own provenance line and an explicit 待核 marker.
//
// The eight sketches below are drawn from the trend classes that the page-18
// pixels do support (rising / falling / late steep rise / steep then flat /
// symmetric U / inverted U / concave-up / concave-down). They are deliberately
// dashed, never numbered and never bound to a template: precise coordinates and
// any encoding basis stay 待核, and no paper template is claimed to be the match.

export const MENTOR_SKETCH_NOTE='原型示意，仅供参考：形状只按原图可辨认的趋势手绘，不是原图像素坐标，也不代表已核实的编码依据。';

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
].map(shape=>({...shape,evidence:'PPT第18页原型图标签与括注',status:'待核'}));

export const MENTOR_BOUNDARIES=[
  '该图不是论文原图，是对话中生成的界面原型图；同页说明自称“原型效果图”“演示性假设”，并声明“不是已经实现功能的可运行软件”。该图与源 PPTX 内的 ppt/media/image9.png 逐字节相同，出处已闭合，但“出处明确”不等于“内容经导师确认”。',
  '整套 PPT 里没有任何一页把八类并列写出来：第18页本身没有任何文本，八个名称只以像素形式存在于嵌图里；第17页的正文列4类，第19页列5类。“4 / 5 / 8”三个数字互不相同，不能任选其一当作定论，也不能把 12 个论文图形当成第九说。',
  '导师本人没有逐条列名：会议记录里只有“八种关系类型”“这八个关系”“那八个八个状态”这类零散词（相关索引 376/390/392/394/402/410/484），从未把八项念出来，也从没说过“形状”或“曲线”。',
  '会议全程没有出现任何论文题录；把导师所指等同于 Stankov 2021 只是既有归属推断，不是会上确认的事实。整理稿自身也写着“演示八张通用曲线不应被宣称为原论文固定八分类”。',
  '八张卡片各自都画了一条折线，形状大类可由像素确认（上升／下降／后段陡升／先陡后平／对称U／倒U／下凸／上凸），但精确坐标与转折点未经人工目视复核；因此这里只按趋势大类手绘虚线示意，不冒充原图像素坐标，也不给出任何编码依据。',
  '因此本组图形只作为可浏览参考：不参与编码、不生成四格分数、不改变当前选型，也不代表导师八类已经实现。'
];

export function mentorBlock() {
  const items=MENTOR_SHAPES.map(shape=>{
    const cell=document.createElement('article');
    cell.className='mentor-shape';
    cell.dataset.mentorShape=shape.id;
    const head=document.createElement('p');
    head.className='mentor-shape-head';
    const label=document.createElement('strong');
    label.textContent=shape.label;
    head.append(label);
    const badge=document.createElement('span');
    badge.className='mentor-badge';
    badge.textContent='待核 · 仅供参考';
    head.append(badge);
    cell.append(head);
    const d=MENTOR_GLYPHS[shape.id];
    const svg=svgNode('svg',{viewBox:'0 0 200 145',width:132,'aria-hidden':'true',focusable:'false',class:'shape-thumb mentor-sketch'});
    svg.style.maxWidth='100%';
    svg.append(svgNode('path',{d,fill:'none',stroke:'var(--tx3)','stroke-width':2,'stroke-linecap':'round','stroke-dasharray':'6 4'}));
    cell.append(svg);
    const note=document.createElement('p');
    note.className='mentor-shape-note';
    note.textContent=MENTOR_SKETCH_NOTE;
    cell.append(note);
    const prov=document.createElement('p');
    prov.className='mentor-shape-source';
    prov.textContent='形状大类：'+shape.glyphClass+'；原图括注：'+shape.parenthetical+'；出处：'+shape.evidence+'；状态：'+shape.status+'（精确坐标与编码依据待核）。';
    cell.append(prov);
    return cell;
  });
  const wrap=document.createElement('div');
  wrap.className='mentor-shapes';
  wrap.append(...items);
  const boundaries=document.createElement('details');
  boundaries.className='mentor-boundaries';
  const summary=document.createElement('summary');
  summary.textContent='为什么这些图形只能作参考（证据边界）';
  boundaries.append(summary);
  for(const text of MENTOR_BOUNDARIES){
    const p=document.createElement('p');
    p.textContent=text;
    boundaries.append(p);
  }
  const host=document.createElement('details');
  host.className='mentor-reference mentor-details';
  host.dataset.mentorReference='';
  const title=document.createElement('summary');
  title.textContent=MENTOR_SECTION_TITLE;
  const body=document.createElement('div');
  body.className='mentor-reference-body';
  const lead=document.createElement('p');
  lead.textContent='这一组不是可计算模板，与上方论文图形不是同一来源，也不能互相折算。参考图形只按原图可辨认的趋势手绘，形状与编码依据都待核。';
  const provenance=document.createElement('p');
  provenance.className='mentor-source-line';
  provenance.textContent='原图：PPT第18页嵌图 ppt-slide-18-image9.png（sha256 F94B3B42…7FD57B1，1797591 字节），与源 PPTX 内 ppt/media/image9.png 逐字节相同；同屏画面见录屏 demo-165541.mp4 约 165 秒处。第18页本身没有任何文本。精确坐标未目视复核。';
  body.append(lead,provenance,wrap,boundaries);
  host.append(title,body);
  return host;
}
