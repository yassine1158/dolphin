import type { KeyValueStore } from "../../ports/index.js";

export class MemoryStore implements KeyValueStore {
  private readonly map = new Map<string, string>();
  async get(key: string) { return this.map.get(key) ?? null; }
  async set(key: string, value: string) { this.map.set(key, value); }
  async delete(key: string) { this.map.delete(key); }
}

/**
 * Browser localStorage, namespaced. Private windows or blocked storage fall back to memory,
 * so the studio keeps working for the current visit.
 */
export class LocalStore implements KeyValueStore {
  private readonly fallback = new MemoryStore();
  constructor(private readonly prefix = "dolphin:") {}

  private ls(): Storage | null {
    try { return globalThis.localStorage ?? null; } catch { return null; }
  }
  async get(key: string) {
    try { const v = this.ls()?.getItem(this.prefix + key); if (v != null) return v; } catch { /* blocked */ }
    return this.fallback.get(key);
  }
  async set(key: string, value: string) {
    try { this.ls()?.setItem(this.prefix + key, value); } catch { /* quota or blocked */ }
    await this.fallback.set(key, value);
  }
  async delete(key: string) {
    try { this.ls()?.removeItem(this.prefix + key); } catch { /* blocked */ }
    await this.fallback.delete(key);
  }
}
