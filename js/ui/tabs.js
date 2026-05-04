import * as state from '../state.js';

const tabBar = document.getElementById('tab-bar');

export function init({ onSwitch }) {
  state.subscribe((event) => {
    if (['tab:add', 'tab:close', 'tab:select', 'tab:query'].includes(event.type)) {
      render();
      if (event.type !== 'tab:query') onSwitch();
    }
  });
  tabBar.addEventListener('click', handleClick);
  render();
}

function makeTab(tab, isActive) {
  const el = document.createElement('div');
  el.className = 'tab' + (isActive ? ' active' : '');
  el.dataset.tabId = tab.id;
  const label = document.createElement('span');
  label.className = 'tab-label';
  label.textContent = tab.label || 'New search';
  const close = document.createElement('button');
  close.className = 'tab-close';
  close.dataset.action = 'close';
  close.title = 'Close tab';
  close.textContent = '×';
  el.append(label, close);
  return el;
}

function makeAddButton() {
  const btn = document.createElement('button');
  btn.className = 'tab-add';
  btn.dataset.action = 'add';
  btn.title = 'New search tab';
  btn.textContent = '+';
  return btn;
}

function render() {
  const s = state.getState();
  tabBar.replaceChildren(
    ...s.tabs.map((tab) => makeTab(tab, tab.id === s.activeTabId)),
    makeAddButton(),
  );
}

function handleClick(e) {
  const action = e.target.dataset.action;
  if (action === 'add') { state.addTab(); return; }
  const tabEl = e.target.closest('.tab');
  if (!tabEl) return;
  const tabId = tabEl.dataset.tabId;
  if (action === 'close') state.closeTab(tabId);
  else state.selectTab(tabId);
}
