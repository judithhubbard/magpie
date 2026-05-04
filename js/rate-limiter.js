// Per-source token-bucket limiter with optional hourly cap.
// Exposes queue depth and next-available-time for the status strip.

class TokenBucket {
  constructor({ requestsPerSecond, requestsPerHour }, onChange) {
    this.rps = requestsPerSecond ?? 10;
    this.rph = requestsPerHour ?? null;
    this.tokens = this.rps;
    this.lastRefill = Date.now();
    this.queue = [];
    this.hourlyHistory = [];
    this.onChange = onChange ?? (() => {});
    this.backoffUntil = 0;
  }

  acquire() {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.onChange(this.snapshot());
      this.drain();
    });
  }

  noteFailure(retryAfterMs) {
    this.backoffUntil = Math.max(this.backoffUntil, Date.now() + retryAfterMs);
    this.onChange(this.snapshot());
    setTimeout(() => this.drain(), retryAfterMs);
  }

  drain() {
    this.refill();
    const now = Date.now();
    while (this.queue.length && this.canConsume(now)) {
      this.tokens -= 1;
      this.hourlyHistory.push(now);
      const resolve = this.queue.shift();
      resolve();
    }
    this.onChange(this.snapshot());
    if (this.queue.length) {
      const wait = this.timeUntilNextSlot();
      setTimeout(() => this.drain(), Math.max(wait, 50));
    }
  }

  refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.rps, this.tokens + elapsed * this.rps);
    this.lastRefill = now;
    if (this.rph != null) {
      const cutoff = now - 3600_000;
      this.hourlyHistory = this.hourlyHistory.filter((t) => t > cutoff);
    }
  }

  canConsume(now) {
    if (now < this.backoffUntil) return false;
    if (this.tokens < 1) return false;
    if (this.rph != null && this.hourlyHistory.length >= this.rph) return false;
    return true;
  }

  timeUntilNextSlot() {
    const now = Date.now();
    let wait = 0;
    if (now < this.backoffUntil) wait = Math.max(wait, this.backoffUntil - now);
    if (this.tokens < 1) wait = Math.max(wait, ((1 - this.tokens) / this.rps) * 1000);
    if (this.rph != null && this.hourlyHistory.length >= this.rph) {
      const oldest = this.hourlyHistory[0];
      wait = Math.max(wait, oldest + 3600_000 - now);
    }
    return wait;
  }

  snapshot() {
    const now = Date.now();
    return {
      queueDepth: this.queue.length,
      backoffMsRemaining: Math.max(0, this.backoffUntil - now),
      nextSlotMs: this.queue.length ? this.timeUntilNextSlot() : 0,
    };
  }
}

const buckets = new Map();
const listeners = new Set();

export function configure(sourceId, config) {
  if (buckets.has(sourceId)) return;
  const bucket = new TokenBucket(config, (snap) =>
    listeners.forEach((fn) => fn(sourceId, snap))
  );
  buckets.set(sourceId, bucket);
}

export function acquire(sourceId) {
  const b = buckets.get(sourceId);
  if (!b) throw new Error(`Rate limiter not configured for ${sourceId}`);
  return b.acquire();
}

export function noteFailure(sourceId, retryAfterMs) {
  buckets.get(sourceId)?.noteFailure(retryAfterMs);
}

export function snapshot(sourceId) {
  return buckets.get(sourceId)?.snapshot() ?? null;
}

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
