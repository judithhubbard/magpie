import * as state from '../state.js';

const strip = document.getElementById('status-strip');

export function init() {
  state.subscribe((event) => {
    if (['status:change', 'tab:select', 'tab:query', 'results:append',
         'results:reject', 'tab:add', 'tab:close', 'filter:source',
         'source:toggle'].includes(event.type)) {
      render();
    }
  });
  strip.addEventListener('click', (e) => {
    const pill = e.target.closest('.status-pill');
    if (!pill) return;
    const tab = state.getActiveTab();
    if (!tab) return;
    state.setSourceFilter(tab.id, pill.dataset.sourceId);
  });
  render();
}

function render() {
  const tab = state.getActiveTab();
  if (!tab || !tab.query) {
    strip.replaceChildren();
    return;
  }
  const enabled = state.getEnabledSources();
  const filterActive = !!tab.sourceFilter;
  strip.replaceChildren(
    ...enabled.map((source) => {
      const ss = tab.perSource[source.id];
      const status = ss?.status || 'idle';
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = `status-pill ${status}`;
      pill.dataset.sourceId = source.id;
      pill.title = filterActive && tab.sourceFilter === source.id
        ? 'Showing only this source — click to clear filter'
        : 'Click to filter results to this source';
      if (filterActive && tab.sourceFilter !== source.id) pill.classList.add('dimmed');
      if (filterActive && tab.sourceFilter === source.id) pill.classList.add('active-filter');

      pill.appendChild(makeIcon(status));
      const name = document.createElement('span');
      name.className = 'source-name';
      name.textContent = source.displayName;
      pill.appendChild(name);
      const detail = document.createElement('span');
      detail.textContent = formatDetail(status, ss);
      pill.appendChild(detail);
      return pill;
    })
  );
}

function makeIcon(status) {
  const span = document.createElement('span');
  if (status === 'loading' || status === 'queued') {
    span.className = 'spinner';
  } else if (status === 'loaded') {
    span.textContent = '✓';
  } else if (status === 'error') {
    span.textContent = '⚠';
  } else if (status === 'rate-limited') {
    span.textContent = '⏳';
  } else {
    span.textContent = '·';
  }
  return span;
}

function formatDetail(status, ss) {
  if (!ss) return '';
  if (status === 'loaded') {
    const cachedTag = ss.statusDetail?.cached ? '·' : '';
    return ` ${ss.results.length}${cachedTag}`;
  }
  if (status === 'loading') return ' loading…';
  if (status === 'queued')  return ' queued';
  if (status === 'rate-limited') {
    const ms = ss.statusDetail?.retryInMs ?? 0;
    return ` retry ${Math.ceil(ms / 1000)}s`;
  }
  if (status === 'error')   return ` error`;
  return '';
}
