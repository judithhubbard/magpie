const STORAGE_PREFIX = 'imgsearch:cache:';

export function get(key) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const { value, expiresAt } = JSON.parse(raw);
    if (Date.now() > expiresAt) {
      localStorage.removeItem(STORAGE_PREFIX + key);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function set(key, value, ttlMs) {
  try {
    const payload = JSON.stringify({ value, expiresAt: Date.now() + ttlMs });
    localStorage.setItem(STORAGE_PREFIX + key, payload);
  } catch (err) {
    if (err.name === 'QuotaExceededError') evictOldest();
  }
}

function evictOldest() {
  const entries = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k.startsWith(STORAGE_PREFIX)) continue;
    try {
      const { expiresAt } = JSON.parse(localStorage.getItem(k));
      entries.push({ k, expiresAt });
    } catch {
      localStorage.removeItem(k);
    }
  }
  entries.sort((a, b) => a.expiresAt - b.expiresAt);
  for (const { k } of entries.slice(0, Math.ceil(entries.length / 4))) {
    localStorage.removeItem(k);
  }
}

export function buildKey(parts) {
  return parts.map((p) => String(p ?? '')).join('|');
}

export function clearAll() {
  const toRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(STORAGE_PREFIX)) toRemove.push(k);
  }
  for (const k of toRemove) localStorage.removeItem(k);
  return toRemove.length;
}
