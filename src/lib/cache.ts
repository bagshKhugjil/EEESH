// src/lib/cache.ts
export type CacheItem<T> = { v: number;  // schema version (optional)
  e: number;  // expiresAt (epoch ms)
  d: T        // actual data
};

export function setCache<T>(key: string, data: T, ttlMs: number, v = 1) {
  const item: CacheItem<T> = { v, e: Date.now() + ttlMs, d: data };
  try { localStorage.setItem(key, JSON.stringify(item)); } catch {}
}

export function getCache<T>(key: string, v = 1): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const item = JSON.parse(raw) as CacheItem<T>;
    if (!item || typeof item !== "object") return null;
    if (item.v !== v) return null;            // schema/version mismatch → ignore
    if (Date.now() > item.e) { localStorage.removeItem(key); return null; } // expired
    return item.d;
  } catch { return null; }
}

export function delCache(key: string) {
  try { localStorage.removeItem(key); } catch {}
}