// Decode-once, reuse in-memory cache (T017, R14 preload policy skeleton). Eviction on category
// change keeps memory bounded (FR-030): once the visitor leaves a category, that category's
// decoded project data is no longer needed until re-selected.

export class ContentCache {
  private readonly entries = new Map<string, unknown>();

  get<T>(key: string): T | undefined {
    return this.entries.get(key) as T | undefined;
  }

  set(key: string, value: unknown): void {
    this.entries.set(key, value);
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  /** Evicts every cached entry whose key is not scoped to `categoryId` (`"<categoryId>:..."`). */
  evictExceptCategory(categoryId: string): void {
    const prefix = `${categoryId}:`;
    for (const key of this.entries.keys()) {
      if (!key.startsWith(prefix)) {
        this.entries.delete(key);
      }
    }
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}
