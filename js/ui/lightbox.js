import { describeLicense, formatAttribution } from '../attribution.js';
import { IS_EMBEDDED, postSelect, isAttached } from '../embedding.js';

const modal = document.getElementById('lightbox');
const content = modal.querySelector('.lightbox-content');

modal.addEventListener('click', (e) => {
  if (e.target.dataset.close !== undefined || e.target.classList.contains('modal-backdrop')) {
    close();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modal.hidden) close();
});

// Build a single <dt><dd> row whose dd is either text or a node. Returns null
// when the value is empty so callers can filter() out blanks.
function row(label, value, { isNode = false } = {}) {
  if (value == null || value === '') return null;
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  if (isNode) dd.appendChild(value);
  else dd.textContent = value;
  return [dt, dd];
}

function externalLink(href, text) {
  const a = document.createElement('a');
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = text;
  return a;
}

// Build a clean filename from the image's title + the extension we can
// guess from its URL. Strips characters illegal in filenames.
function filenameFromImage(image) {
  const cleanTitle = (image.title || 'image')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'image';
  const url = image.fullUrl || image.thumbnailUrl || '';
  // Match against the URL path part only (ignore query string)
  const ext = url.split('?')[0].match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase()
    || (image.fullUrl?.includes('default.jpg') ? 'jpg' : 'jpg');
  return `${cleanTitle}.${ext}`;
}

// Briefly flash a button's label to give feedback after an action.
function flashButton(button, message, restoreMs = 1500) {
  const original = button.textContent;
  button.textContent = message;
  setTimeout(() => { button.textContent = original; }, restoreMs);
}

// Try to download via blob (preserves a clean filename); fall back to
// opening the URL in a new tab if the host doesn't allow CORS image fetch.
async function downloadImage(image, button) {
  const filename = filenameFromImage(image);
  const url = image.fullUrl || image.thumbnailUrl;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objUrl);
    flashButton(button, 'Downloaded ✓');
  } catch (err) {
    console.warn('[lightbox] direct download failed, opening in new tab:', err);
    window.open(url, '_blank', 'noopener');
    flashButton(button, 'Opened in new tab');
  }
}

export function openLightbox(image) {
  const license = describeLicense(image.license);
  const attribution = formatAttribution({
    title: image.title,
    creator: image.creator,
    sourceName: image.sourceName,
    sourceUrl: image.sourceUrl,
    license: image.license,
    licenseUrl: image.licenseUrl,
  });

  content.innerHTML = '';

  const imgWrap = document.createElement('div');
  imgWrap.className = 'lightbox-image-wrap';
  const img = document.createElement('img');
  img.src = image.fullUrl || image.thumbnailUrl;
  img.alt = image.title || '';
  imgWrap.appendChild(img);
  content.appendChild(imgWrap);

  const meta = document.createElement('div');
  meta.className = 'lightbox-meta';

  const h3 = document.createElement('h3');
  h3.textContent = image.title || 'Untitled';
  meta.appendChild(h3);

  // Build dl with only non-empty rows.
  const dl = document.createElement('dl');
  const sourceLink = image.sourceUrl
    ? externalLink(image.sourceUrl, image.sourceName || image.sourceId)
    : null;
  const licenseNode = (() => {
    const span = document.createElement('span');
    span.title = license.explanation;
    if (image.licenseUrl) {
      span.appendChild(externalLink(image.licenseUrl, license.name));
      span.appendChild(document.createTextNode(' — ' + license.explanation));
    } else {
      span.textContent = `${license.name} — ${license.explanation}`;
    }
    return span;
  })();
  const dimsText = (image.width && image.height) ? `${image.width} × ${image.height}` : null;

  const rows = [
    row('Creator', image.creator),
    row('Source', sourceLink || (image.sourceName || image.sourceId), { isNode: !!sourceLink }),
    row('License', licenseNode, { isNode: true }),
    row('Dimensions', dimsText),
  ].filter(Boolean);
  for (const [dt, dd] of rows) dl.append(dt, dd);
  meta.appendChild(dl);

  if (image.description) {
    const descSection = document.createElement('div');
    descSection.className = 'lightbox-description';
    const heading = document.createElement('strong');
    heading.textContent = 'Description';
    const body = document.createElement('div');
    body.className = 'description-body';
    body.textContent = image.description;
    descSection.append(heading, body);
    meta.appendChild(descSection);
  }

  const attrSection = document.createElement('div');
  const attrLabel = document.createElement('strong');
  attrLabel.textContent = 'Attribution';
  const attrBox = document.createElement('div');
  attrBox.className = 'attribution-box';
  attrBox.textContent = attribution;
  attrSection.append(attrLabel, attrBox);
  meta.appendChild(attrSection);

  const actions = document.createElement('div');
  actions.className = 'lightbox-actions';

  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'primary';
  downloadBtn.textContent = 'Download';
  downloadBtn.title = `Save image as "${filenameFromImage(image)}"`;
  downloadBtn.addEventListener('click', () => downloadImage(image, downloadBtn));

  const copyUrlBtn = document.createElement('button');
  copyUrlBtn.textContent = 'Copy image URL';
  copyUrlBtn.title = 'Put the direct image URL on your clipboard';
  copyUrlBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(image.fullUrl || image.thumbnailUrl);
      flashButton(copyUrlBtn, 'Copied URL ✓');
    } catch {
      flashButton(copyUrlBtn, 'Copy failed');
    }
  });

  const copyAttrBtn = document.createElement('button');
  copyAttrBtn.textContent = 'Copy attribution';
  copyAttrBtn.title = 'Put the formatted attribution text on your clipboard';
  copyAttrBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(attribution);
      flashButton(copyAttrBtn, 'Copied ✓');
    } catch {
      flashButton(copyAttrBtn, 'Copy failed');
    }
  });

  const closeBtn = document.createElement('button');
  closeBtn.dataset.close = '';
  closeBtn.textContent = 'Close';

  if (IS_EMBEDDED) {
    if (isAttached(image)) {
      const chip = document.createElement('span');
      chip.className = 'lightbox-attached';
      chip.textContent = '✓ In catalog';
      chip.title = 'Already added to this species’s photos';
      actions.append(chip);
    } else {
      const selectBtn = document.createElement('button');
      selectBtn.className = 'primary lightbox-select';
      selectBtn.textContent = '📥 Select';
      selectBtn.title = 'Send this image’s attribution to the host page';
      selectBtn.addEventListener('click', () => {
        const sent = postSelect(image);
        flashButton(selectBtn, sent ? 'Sent ✓' : 'Send failed');
      });
      actions.append(selectBtn);
    }
  }

  actions.append(downloadBtn, copyUrlBtn, copyAttrBtn, closeBtn);
  meta.appendChild(actions);

  content.appendChild(meta);
  modal.hidden = false;
}

function close() {
  modal.hidden = true;
  content.innerHTML = '';
}
