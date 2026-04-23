/**
 * Resolution Cache — TTL-based in-memory cache for name→ID lookups.
 *
 * Caches both directions:
 *   name → ResolvedId  (e.g., "Project Alpha" → { id: 123, name: "Project Alpha", resolvedFrom: "exact" })
 *   id → name           (e.g., 123 → "Project Alpha")
 *
 * Cache TTL defaults to 60s, configurable via CACHE_TTL_MS env var.
 */

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 60_000;

function getTtlMs(): number {
  const envValue = process.env.CACHE_TTL_MS;
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_TTL_MS;
}

export class ResolutionCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private ttlMs: number;

  constructor(ttlMs?: number) {
    this.ttlMs = ttlMs ?? getTtlMs();
  }

  /** Get a cached value. Returns undefined if not found or expired. */
  get<T = unknown>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  /** Store a value with TTL. */
  set<T = unknown>(key: string, value: T): void {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  /** Check if a key exists and is not expired. */
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /** Delete a specific key. */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /** Clear all cached entries. */
  clear(): void {
    this.cache.clear();
  }

  /** Return the number of non-expired entries. */
  get size(): number {
    // Prune expired entries first
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
    return this.cache.size;
  }

  /** Build a cache key for a project name lookup. */
  static projectKey(name: string): string {
    return `project:${name.toLowerCase().trim()}`;
  }

  /** Build a cache key for a user name/email lookup. */
  static userKey(nameOrEmail: string): string {
    return `user:${nameOrEmail.toLowerCase().trim()}`;
  }

  /** Build a reverse lookup cache key for a project ID. */
  static projectIdKey(id: number): string {
    return `project_id:${id}`;
  }

  /** Build a reverse lookup cache key for a user ID. */
  static userIdKey(id: number): string {
    return `user_id:${id}`;
  }
}