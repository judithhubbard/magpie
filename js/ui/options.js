import * as state from '../state.js';

let button, countEl, menu;
let onChange = () => {};

// Per-tab option declarations. Adding a new option = add an entry here.
const OPTIONS = [
  {
    group: 'License',
    items: [
      { key: 'commercial',     label: 'Commercial use',
        title: 'Only show licenses that allow commercial use' },
      { key: 'derivatives',    label: 'Allow derivatives',
        title: 'Only show licenses that allow modifying / adapting the image' },
    ],
  },
  {
    group: 'Matching',
    items: [
      { key: 'strictMatching', label: 'Whole-word match',
        title: 'When on, "cat" matches the word "cat" only — not "cats", "category", or "cathedral".' },
    ],
  },
  {
    group: 'Format',
    items: [
      { key: 'vectorOnly', label: 'Vector graphics only',
        title: 'Limit results to SVG / vector content. Sources without vector content are skipped.' },
    ],
  },
  {
    group: 'Filtering',
    items: [
      { key: 'safeSearch', label: 'Safe search',
        title: 'Filter adult content where supported.' },
    ],
    note: 'Best-effort: native API filter on Openverse / Pixabay / Unsplash / Flickr; client-side keyword filter on Wikimedia / Internet Archive / LOC. Museum & scientific sources have no filter (their content is curated and unlikely to be adult). Verify before reuse.',
  },
];

export function init({ onChange: cb }) {
  onChange = cb || onChange;
  button  = document.getElementById('options-menu-button');
  countEl = document.getElementById('options-menu-count');
  menu    = document.getElementById('options-menu');
  if (!button || !countEl || !menu) {
    console.warn('Options menu elements missing — UI disabled.');
    return;
  }

  state.subscribe((event) => {
    if (event.type === 'options:change') {
      renderMenu();
      renderButton();
    }
  });

  button.addEventListener('click', toggleMenu);
  menu.addEventListener('change', (e) => {
    const key = e.target.dataset?.optionKey;
    if (!key) return;
    state.setOption(key, e.target.checked);
    onChange();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) closeMenu();
  });

  renderMenu();
  renderButton();
}

function renderButton() {
  const opts = state.getOptions();
  let count = 0;
  for (const grp of OPTIONS) for (const it of grp.items) if (opts[it.key]) count++;
  countEl.textContent = count > 0 ? `(${count})` : '';
}

function renderMenu() {
  menu.replaceChildren();
  const opts = state.getOptions();
  for (const group of OPTIONS) {
    const wrap = document.createElement('div');
    wrap.className = 'source-menu-group';
    const header = document.createElement('div');
    header.className = 'source-menu-group-header';
    const title = document.createElement('span');
    title.className = 'source-menu-group-title';
    title.textContent = group.group;
    header.appendChild(title);
    wrap.appendChild(header);
    for (const it of group.items) {
      const item = document.createElement('label');
      item.className = 'source-menu-item';
      item.title = it.title || '';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.dataset.optionKey = it.key;
      cb.checked = !!opts[it.key];
      const label = document.createElement('span');
      label.textContent = it.label;
      item.append(cb, label);
      wrap.appendChild(item);
    }
    if (group.note) {
      const note = document.createElement('div');
      note.className = 'options-group-note';
      note.textContent = group.note;
      wrap.appendChild(note);
    }
    menu.appendChild(wrap);
  }
}

function toggleMenu() { if (menu.hidden) openMenu(); else closeMenu(); }
function openMenu() {
  menu.hidden = false;
  button.setAttribute('aria-expanded', 'true');
  setTimeout(() => document.addEventListener('mousedown', closeOnOutside), 0);
}
function closeMenu() {
  menu.hidden = true;
  button.setAttribute('aria-expanded', 'false');
  document.removeEventListener('mousedown', closeOnOutside);
}
function closeOnOutside(e) {
  if (menu.contains(e.target) || button.contains(e.target)) return;
  closeMenu();
}
