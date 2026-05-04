import * as state from '../state.js';
import { ALL_SOURCES } from '../sources/index.js';
import { CATEGORIES } from '../sources/base.js';

let button, countEl, menu;
let onChange = () => {};

export function init({ onChange: cb }) {
  onChange = cb || onChange;

  // Read DOM elements lazily so an HTML/JS mismatch doesn't crash module load.
  button  = document.getElementById('source-menu-button');
  countEl = document.getElementById('source-menu-count');
  menu    = document.getElementById('source-menu');
  if (!button || !countEl || !menu) {
    console.warn('Source menu elements missing — filter UI disabled.');
    return;
  }

  state.subscribe((event) => {
    if (['apiKey:change', 'source:toggle', 'tab:select', 'tab:add', 'tab:close'].includes(event.type)) {
      renderMenu();
      renderButton();
    }
  });

  button.addEventListener('click', toggleMenu);

  // Delegate clicks inside the menu (group All/None + per-source toggles).
  menu.addEventListener('click', (e) => {
    const action = e.target.dataset?.action;
    if (action === 'open-settings') {
      e.preventDefault();
      e.stopPropagation();
      closeMenu();
      document.getElementById('settings-button')?.click();
      return;
    }
    if (action === 'group-all' || action === 'group-none') {
      const cat = e.target.dataset.category;
      const enable = action === 'group-all';
      for (const source of sourcesInCategory(cat)) {
        if (enable && source.requiresKey && !state.getState().apiKeys[source.id]) continue;
        state.setSourceEnabled(source.id, enable);
      }
      onChange();
      return;
    }
    const item = e.target.closest('.source-menu-item');
    if (!item || item.classList.contains('disabled-no-key')) return;
    const sourceId = item.dataset.sourceId;
    state.setSourceEnabled(sourceId, !state.isSourceEnabled(sourceId));
    onChange();
  });

  // Close on Escape.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) closeMenu();
  });

  renderMenu();
  renderButton();
}

function sourcesInCategory(category) {
  return ALL_SOURCES.filter((s) => s.category === category);
}

function effectivelyEnabled(source) {
  if (!state.isSourceEnabled(source.id)) return false;
  if (source.requiresKey && !state.getState().apiKeys[source.id]) return false;
  return true;
}

function renderButton() {
  const enabled = ALL_SOURCES.filter(effectivelyEnabled).length;
  countEl.textContent = `(${enabled}/${ALL_SOURCES.length})`;
}

function renderMenu() {
  menu.replaceChildren();
  for (const [catKey, catLabel] of Object.entries(CATEGORIES)) {
    const sources = sourcesInCategory(catKey);
    if (!sources.length) continue;
    menu.appendChild(renderGroup(catKey, catLabel, sources));
  }
}

function renderGroup(catKey, catLabel, sources) {
  const group = document.createElement('div');
  group.className = 'source-menu-group';
  const header = document.createElement('div');
  header.className = 'source-menu-group-header';
  const title = document.createElement('span');
  title.className = 'source-menu-group-title';
  title.textContent = catLabel;
  const actions = document.createElement('div');
  actions.className = 'source-menu-group-actions';
  const all = document.createElement('button');
  all.type = 'button';
  all.dataset.action = 'group-all';
  all.dataset.category = catKey;
  all.textContent = 'All';
  const none = document.createElement('button');
  none.type = 'button';
  none.dataset.action = 'group-none';
  none.dataset.category = catKey;
  none.textContent = 'None';
  actions.append(all, none);
  header.append(title, actions);
  group.appendChild(header);
  for (const source of sources) group.appendChild(renderItem(source));
  return group;
}

function renderItem(source) {
  const apiKey = state.getState().apiKeys[source.id];
  const hasKey = !source.requiresKey || apiKey;
  const item = document.createElement('label');
  item.className = 'source-menu-item';
  if (!hasKey) {
    item.classList.add('disabled-no-key');
    item.title = 'Add a key in Settings to enable this source';
  }
  item.dataset.sourceId = source.id;

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = effectivelyEnabled(source);
  cb.disabled = !hasKey;

  const label = document.createElement('span');
  label.textContent = source.displayName;

  item.append(cb, label);

  if (source.requiresKey && !apiKey) {
    const tag = document.createElement('button');
    tag.type = 'button';
    tag.className = 'needs-key';
    tag.dataset.action = 'open-settings';
    tag.textContent = 'add key →';
    tag.title = 'Open Settings to add an API key';
    item.appendChild(tag);
  }
  return item;
}

// ---- open / close ----

function toggleMenu() {
  if (menu.hidden) openMenu();
  else closeMenu();
}

function openMenu() {
  menu.hidden = false;
  button.setAttribute('aria-expanded', 'true');
  // Defer outside-click listener so we don't catch the click that just opened us.
  setTimeout(() => document.addEventListener('mousedown', closeOnOutside), 0);
}

function closeMenu() {
  menu.hidden = true;
  button.setAttribute('aria-expanded', 'false');
  document.removeEventListener('mousedown', closeOnOutside);
}

function closeOnOutside(e) {
  if (menu.contains(e.target)) return;
  if (button.contains(e.target)) return;
  closeMenu();
}
