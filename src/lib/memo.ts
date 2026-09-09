type Entry = { value: unknown; expires: number }

/**
 * In-instance memo for routes whose cache key is unbounded.
 *
 * A cache keyed on unbounded input cannot be write-capped by any TTL: the
 * caller picks a fresh aircraft every minute, so nearly every hex, callsign and
 * airport is a key seen for the first time, and a first write is a write
 * however long it would have lived. That makes Vercel's Data Cache
 * (`next: { revalidate }`) bill an ISR write for very nearly every call, and
 * the Runtime Cache only changes which meter charges for it — the move
 * `api/flight` already records making once.
 *
 * So: no platform cache, and a plain Map on the instance instead. It costs
 * nothing, it dedupes everything a warm instance sees, and it dies with that
 * instance — the right trade when the entries are, by construction, mostly
 * never read twice.
 */
export const createMemo = (max = 500) => {
  const memo = new Map<string, Entry>()
  return async <T>(
    key: string,
    ttl: number,
    load: () => Promise<T>,
  ): Promise<T> => {
    const hit = memo.get(key)
    if (hit && hit.expires > Date.now()) return hit.value as T
    const value = await load()
    // Oldest-first eviction. Map iterates in insertion order, so the first key
    // is the longest-standing one — enough to stop a long-lived instance
    // growing without bound on a key space that has no bound of its own.
    if (memo.size >= max) {
      const oldest = memo.keys().next().value
      if (oldest !== undefined) memo.delete(oldest)
    }
    memo.set(key, { value, expires: Date.now() + ttl * 1000 })
    return value
  }
}
