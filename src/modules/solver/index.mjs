import { el } from '../../core/ui.mjs';

export function mount(container, context) {
  container.append(el('section', { class: 'solver-module empty-state' }, el('h2', {}, 'CIB检验与解释尚未接入'), el('p', {}, 'S1将使用明确选用的矩阵检验配置并展示逐项影响贡献。当前仅预接入口，没有运行计算。'), el('button', { class: 'button', onclick: () => context.navigate('relationships', 'matrix') }, '返回矩阵准备')));
  return () => {};
}
