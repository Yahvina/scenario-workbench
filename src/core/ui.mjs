export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value !== false && value !== null && value !== undefined) node.setAttribute(key, String(value));
  }
  for (const child of children.flat(Infinity)) if (child !== null && child !== undefined) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return node;
}

// 右侧抽屉：长内容（政策资料、来源、定义）不再塞进页内折叠。
// 打开时只新建覆盖层与面板，不搬动原页面，因此关闭后原滚动位置、对象与草稿都在；
// Esc 或点关闭后焦点返回触发按钮。窄屏由 CSS 变为全宽面板。
// 同时只允许一个抽屉：重开时先走正式关闭链，否则旧 panel 残留、body overflow 状态也会错。
let activeDrawerClose = null;
export function openDrawer(trigger, title, buildContent) {
  activeDrawerClose?.();
  const previousOverflow = document.body.style.overflow;
  const back = trigger || document.activeElement;
  const close = () => {
    if (activeDrawerClose !== close) return;
    activeDrawerClose = null;
    overlay.remove(); panel.remove(); document.body.style.overflow = previousOverflow; back?.focus?.();
  };
  const overlay = el('div', { class: 'app-drawer-overlay', 'aria-hidden': 'true' });
  overlay.addEventListener('click', close);
  const heading = el('h3', { id: 'app-drawer-title' }, title);
  const body = el('div', { class: 'app-drawer-body' });
  const panel = el('aside', { class: 'app-drawer', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'app-drawer-title' },
    el('div', { class: 'app-drawer-hd' }, heading, el('button', { type: 'button', class: 'button text', onclick: close }, '关闭')), body);
  panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
  document.body.append(overlay, panel);
  document.body.style.overflow = 'hidden';
  activeDrawerClose = close;
  try { buildContent(body, close); } catch { close(); return; }
  panel.querySelector('button')?.focus();
  return close;
}

// 路由切换时调用：抽屉挂在 body 上，不随页面内容一起销毁，需显式关闭。
export function closeActiveDrawer() { activeDrawerClose?.(); }

// 次要说明统一收进标题旁的“i”：悬停、聚焦、点击都能看，键盘可读。
export function infoTip(text, label = '说明') {
  const wrap = el('span', { class: 'info-tip' });
  const pop = el('span', { class: 'info-pop', role: 'note', hidden: 'hidden' }, text);
  const btn = el('button', { type: 'button', class: 'info-btn', 'aria-label': label, 'aria-expanded': 'false' }, 'i');
  const open = value => { pop.hidden = !value; btn.setAttribute('aria-expanded', String(value)); };
  btn.addEventListener('mouseenter', () => open(true));
  btn.addEventListener('mouseleave', () => open(false));
  btn.addEventListener('focus', () => open(true));
  btn.addEventListener('blur', () => open(false));
  btn.addEventListener('keydown', event => { if (event.key === 'Escape') open(false); });
  btn.addEventListener('click', event => { event.preventDefault(); open(pop.hidden); });
  wrap.append(btn, pop);
  return wrap;
}
