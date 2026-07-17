'use strict';
/**
 * src/services/cache.js
 *
 * Lightweight in-memory TTL cache. No external dependencies.
 * Default TTL: 60 seconds.
 */

const DEFAULT_TTL_MS = 60 * 1000; // 60 seconds

class Cache {
  constructor(ttlMs = DEFAULT_TTL_MS) {
    this.ttl = ttlMs;
    this.store = new Map(); // key -> { value, expiresAt }
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key, value) {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttl });
  }

  has(key) {
    return this.get(key) !== null;
  }

  /** Remove all expired entries (call periodically if desired) */
  purge() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
  }

  get size() {
    return this.store.size;
  }
}

// Singleton shared across the app
const cache = new Cache();
module.exports = cache;
