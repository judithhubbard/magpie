import * as state from '../state.js';
import { describeLicense, formatAttribution } from '../attribution.js';
import { openLightbox } from './lightbox.js';

const button       = document.getElementById('saved-button');
const countEl      = document.getElementById('saved-count');
const modal        = document.getElementById('saved-modal');
const modalCount   = document.getElementById('saved-modal-count');
const grid         = document.getElementById('saved-grid');
const downloadAll  = document.getElementById('download-all-btn');
const exportHtml   = document.getElementById('export-html-btn');
const exportMd     = document.getElementById('export-md-btn');
const exportAttr   = document.getElementById('export-attr-btn');
const clearBtn     = document.getElementById('clear-saved-btn');

export function init() {
  state.subscribe((event) => {
    if (['saved:add', 'saved:remove', 'saved:clear'].includes(event.type)) {
      renderHeader();
      if (!modal.hidden) renderModal();
    }
  });

  button.addEventListener('click', open);
  modal.addEventListener('click', (e) => {
    if (e.target.dataset?.close !== undefined || e.target.classList.contains('modal-backdrop')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) close();
  });

  grid.addEventListener('click', (e) => {
    const tile = e.target.closest('.saved-tile');
    if (!tile) return;
    const id = tile.dataset.imageId;
    if (e.target.dataset?.action === 'remove') {
      e.stopPropagation();
      state.unsaveImage(id);
      return;
    }
    const image = state.getSaved().find((s) => s.id === id);
    if (image) openLightbox(image);
  });

  downloadAll.addEventListener('click', () => downloadAllImages(downloadAll));
  exportHtml.addEventListener('click',  () => exportAsHtml());
  exportMd.addEventListener('click',    () => exportAsMarkdown(exportMd));
  exportAttr.addEventListener('click',  () => exportAsAttributions(exportAttr));
  clearBtn.addEventListener('click', () => {
    if (confirm('Remove all saved images? This cannot be undone.')) state.clearSaved();
  });

  renderHeader();
}

function open()  { renderModal(); modal.hidden = false; }
function close() { modal.hidden = true; }

function renderHeader() {
  const n = state.getSaved().length;
  countEl.textContent = String(n);
  button.classList.toggle('has-saved', n > 0);
}

function renderModal() {
  const items = state.getSaved();
  modalCount.textContent = items.length ? `(${items.length})` : '';
  if (!items.length) {
    grid.replaceChildren(emptyState('No saved images yet. Click ☆ on any image tile to save it.'));
    return;
  }
  grid.replaceChildren(...items.map(renderTile));
}

function renderTile(image) {
  const tile = document.createElement('div');
  tile.className = 'saved-tile';
  tile.dataset.imageId = image.id;
  const desc = describeLicense(image.license);

  const img = document.createElement('img');
  img.loading = 'lazy';
  img.src = image.thumbnailUrl;
  img.alt = image.title || '';
  tile.appendChild(img);

  const meta = document.createElement('div');
  meta.className = 'saved-tile-meta';
  const t = document.createElement('div');
  t.className = 'saved-tile-title';
  t.textContent = image.title || 'Untitled';
  const s = document.createElement('div');
  s.className = 'saved-tile-source';
  s.textContent = `${image.sourceName || image.sourceId} · ${desc.name}`;
  meta.append(t, s);
  tile.appendChild(meta);

  const remove = document.createElement('button');
  remove.className = 'saved-tile-remove';
  remove.dataset.action = 'remove';
  remove.textContent = '×';
  remove.title = 'Remove from saved';
  tile.appendChild(remove);

  return tile;
}

function emptyState(text) {
  const div = document.createElement('div');
  div.className = 'empty-state';
  div.textContent = text;
  return div;
}

// ---- export ----

function attrFor(image) {
  return formatAttribution({
    title: image.title,
    creator: image.creator,
    sourceName: image.sourceName,
    sourceUrl: image.sourceUrl,
    license: image.license,
    licenseUrl: image.licenseUrl,
  });
}

function flashButton(button, message, restoreMs = 1500) {
  const original = button.textContent;
  button.textContent = message;
  setTimeout(() => { button.textContent = original; }, restoreMs);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function exportAsHtml() {
  const items = state.getSaved();
  if (!items.length) return;
  const cards = items.map((img) => `
    <div class="card">
      <img src="${escapeHtml(img.fullUrl || img.thumbnailUrl)}" alt="${escapeHtml(img.title || '')}" />
      <div class="caption">
        <h3>${escapeHtml(img.title || 'Untitled')}</h3>
        <p class="attribution">${escapeHtml(attrFor(img))}</p>
      </div>
    </div>`).join('\n');
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Saved images — ${items.length}</title>
<style>
  body { font: 14px/1.5 -apple-system, BlinkMacSystemFont, sans-serif; max-width: 900px; margin: 24px auto; padding: 0 16px; color: #1a1a1a; }
  h1 { font-size: 22px; }
  .print-hint { background: #fff7e6; border: 1px solid #f5c66c; padding: 8px 12px; border-radius: 4px; font-size: 13px; margin-bottom: 24px; }
  .card { margin: 32px 0; border-bottom: 1px solid #e0e0e0; padding-bottom: 24px; }
  .card img { max-width: 100%; height: auto; display: block; margin-bottom: 12px; }
  .card h3 { margin: 0 0 8px; font-size: 16px; }
  .attribution { font-size: 12px; color: #555; font-family: ui-monospace, SFMono-Regular, monospace; word-break: break-word; }

  /* Print / PDF — one image per page, scaled to fit. */
  @media print {
    body { max-width: none; margin: 0; padding: 0; }
    h1, .print-hint { display: none; }
    .card {
      margin: 0; padding: 16px;
      border-bottom: none;
      page-break-after: always;
      page-break-inside: avoid;
      display: flex; flex-direction: column; align-items: center;
      min-height: 95vh;
    }
    .card:last-child { page-break-after: auto; }
    .card img { max-width: 100%; max-height: 80vh; height: auto; object-fit: contain; }
    .caption { width: 100%; }
  }
</style>
</head>
<body>
  <h1>Saved images (${items.length})</h1>
  <div class="print-hint">To save as PDF: press <strong>Cmd+P</strong> (or Ctrl+P) and choose "Save as PDF" as the destination. Each image will print on its own page.</div>
  ${cards}
</body>
</html>`;
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  // Don't revoke immediately — give the new tab time to load it.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

// Build a clean filename from the image's title + extension guessed from URL.
function filenameFromImage(image) {
  const cleanTitle = (image.title || 'image')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'image';
  const url = image.fullUrl || image.thumbnailUrl || '';
  const ext = url.split('?')[0].match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase() || 'jpg';
  return `${cleanTitle}.${ext}`;
}

async function downloadOne(image) {
  const url = image.fullUrl || image.thumbnailUrl;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const blob = await response.blob();
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objUrl;
  a.download = filenameFromImage(image);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objUrl);
}

async function downloadAllImages(button) {
  const items = state.getSaved();
  if (!items.length) return;
  const originalLabel = button.textContent;
  button.disabled = true;
  let ok = 0, failed = 0;
  for (let i = 0; i < items.length; i++) {
    button.textContent = `Downloading ${i + 1}/${items.length}…`;
    try {
      await downloadOne(items[i]);
      ok++;
    } catch (err) {
      failed++;
      console.warn('[saved] download failed for', items[i].id, err);
    }
    // Brief delay so the browser can process each download separately.
    await new Promise((r) => setTimeout(r, 250));
  }
  button.disabled = false;
  button.textContent = failed
    ? `${ok} downloaded, ${failed} failed`
    : `Downloaded ${ok} ✓`;
  setTimeout(() => { button.textContent = originalLabel; }, 3000);
}

async function exportAsMarkdown(button) {
  const items = state.getSaved();
  if (!items.length) return;
  const md = items.map((img) => {
    const title = img.title || 'Untitled';
    const url = img.fullUrl || img.thumbnailUrl;
    return `## ${title}\n\n![${title}](${url})\n\n*${attrFor(img)}*\n`;
  }).join('\n---\n\n');
  try {
    await navigator.clipboard.writeText(`# Saved images (${items.length})\n\n${md}`);
    flashButton(button, 'Markdown copied ✓');
  } catch {
    flashButton(button, 'Copy failed');
  }
}

async function exportAsAttributions(button) {
  const items = state.getSaved();
  if (!items.length) return;
  const text = items.map((img, i) => `${i + 1}. ${attrFor(img)}`).join('\n');
  try {
    await navigator.clipboard.writeText(text);
    flashButton(button, 'Attributions copied ✓');
  } catch {
    flashButton(button, 'Copy failed');
  }
}
