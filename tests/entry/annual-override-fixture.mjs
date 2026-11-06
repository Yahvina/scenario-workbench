// P7-C1 独立测试入口：整段代码只属于测试树。
//
// 正式入口 index.html 仍然是 ./src/app.mjs，默认离线产物只包含它；本文件既不在
// index.html 里，也不会被 scripts/build.mjs 收进 dist。
//
// 它负责两件事：
//   1. 直接挂载时间路径模块（不走 src/app.mjs），页面与上下文都在测试树里搭；
//   2. 通过 context.reviewBindingFor 把页面预置的夹具绑定显式交给年度覆盖预览。
//
// 夹具绑定只能从这个入口自己读的那个槽取；生产模块既不认识这个全局名，
// 也没有任何别的通路能把绑定送进数值判定。
import { createProjectStore } from '../../src/core/project-store.mjs';
import { createActions } from '../../src/core/actions.mjs';
import { mount as mountTimeline } from '../../src/modules/timeline/index.mjs';

const PROJECT_KEY = 'scenario-workbench.project.v1';
const SLOT = '__scenarioWorkbenchReviewBindingFixtureNow';

function readSeededProject() {
  try {
    const raw = localStorage.getItem(PROJECT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function fixtureBinding(path) {
  const table = globalThis[SLOT];
  if (!table || typeof table !== 'object') return null;
  const value = table[path?.id];
  return value && typeof value === 'object' ? value : null;
}

const store = createProjectStore('fixture-annual-override', readSeededProject());
const actions = createActions(store);
// 正式外壳（src/app.mjs）负责把每次提交写回浏览器；独立入口要自己承担这一步，
// 否则「保存路径」之后读不到新的修订号，也就无从证明预览本身没有写入。
store.subscribe(project => {
  try {
    localStorage.setItem(PROJECT_KEY, JSON.stringify(project));
  } catch {
    /* 内存里的项目仍然可用 */
  }
});

mountTimeline(document.querySelector('#app'), {
  store,
  actions,
  navigate: () => {},
  notify: () => {},
  refresh: () => {},
  contractVersion: '1.0.0',
  persistenceState: () => ({ok: true, error: null}),
  reviewBindingFor: fixtureBinding
});
