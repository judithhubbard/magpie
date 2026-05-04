import * as state from '../state.js';
import * as cache from '../cache.js';
import { ALL_SOURCES } from '../sources/index.js';

const button = document.getElementById('settings-button');
const modal  = document.getElementById('settings-modal');
const keysContainer = document.getElementById('settings-keys');

export function init() {
  button.addEventListener('click', open);
  modal.addEventListener('click', (e) => {
    if (e.target.dataset.close !== undefined || e.target.classList.contains('modal-backdrop')) close();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });

  document.getElementById('clear-cache-btn').addEventListener('click', () => {
    const removed = cache.clearAll();
    const status = document.getElementById('clear-cache-status');
    status.textContent = `Cleared ${removed} cached entr${removed === 1 ? 'y' : 'ies'}. Re-run your search.`;
  });

  renderKeys();
}

function open() {
  renderKeys();
  modal.hidden = false;
}
function close() { modal.hidden = true; }

function renderKeys() {
  const keyedSources = ALL_SOURCES.filter((s) => s.requiresKey);
  if (!keyedSources.length) {
    keysContainer.innerHTML = '<p style="color: var(--fg-soft);">No keyed sources configured yet.</p>';
    return;
  }
  keysContainer.replaceChildren(
    ...keyedSources.map((source) => {
      const row = document.createElement('div');
      row.className = 'settings-key-row';
      row.innerHTML = `
        <label></label>
        <input type="text" autocomplete="off" spellcheck="false" />
        <span class="help-link"></span>
      `;
      row.querySelector('label').textContent = source.displayName;
      const input = row.querySelector('input');
      input.value = state.getState().apiKeys[source.id] || '';
      input.placeholder = `Paste your ${source.displayName} key`;
      input.addEventListener('change', () => state.setApiKey(source.id, input.value.trim()));

      const help = row.querySelector('.help-link');
      if (source.keyHelpUrl) {
        const a = document.createElement('a');
        a.href = source.keyHelpUrl;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = 'Get a free key →';
        help.appendChild(a);
      }
      return row;
    })
  );
}
