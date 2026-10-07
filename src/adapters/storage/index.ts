// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Yassine Chaabane. Commercial license: COMMERCIAL-LICENSE.md
import { DolphinError } from "../../core/errors.js";
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
  /** Keys whose last write did not reach localStorage: their stored value is stale. */
  private readonly memoryOnly = new Set<string>();
  constructor(private readonly prefix = "dolphin:") {}

  private ls(): Storage | null {
    try { return globalThis.localStorage ?? null; } catch { return null; }
  }
  async get(key: string) {
    if (!this.memoryOnly.has(key)) {
      try { const v = this.ls()?.getItem(this.prefix + key); if (v != null) return v; } catch { /* blocked */ }
    }
    return this.fallback.get(key);
  }
  async set(key: string, value: string) {
    try {
      const ls = this.ls();
      if (!ls) throw new Error("no storage");
      ls.setItem(this.prefix + key, value);
      this.memoryOnly.delete(key);
    } catch { this.memoryOnly.add(key); /* quota or blocked: never read the old value back */ }
    await this.fallback.set(key, value);
  }
  async delete(key: string) {
    try { this.ls()?.removeItem(this.prefix + key); } catch { /* blocked */ }
    this.memoryOnly.delete(key);
    await this.fallback.delete(key);
  }
}

const DB = "dolphin", STORE = "kv";

/**
 * IndexedDB, namespaced: room for background photos and long histories (localStorage holds ~5 MB).
 * Data written by older versions in localStorage is moved here the first time it is read.
 * Without IndexedDB (old browser, blocked storage) it falls back to LocalStore.
 */
export class IdbStore implements KeyValueStore {
  private readonly legacy: LocalStore;
  private db: Promise<IDBDatabase | null> | undefined;
  constructor(private readonly prefix = "dolphin:", private readonly name = DB) {
    this.legacy = new LocalStore(prefix);
  }

  private open(): Promise<IDBDatabase | null> {
    // a database of the same name without our store (made by another script) is upgraded once
    const attempt = (version?: number): Promise<IDBDatabase | null> => new Promise(resolve => {
      try {
        const req = version ? globalThis.indexedDB?.open(this.name, version) : globalThis.indexedDB?.open(this.name);
        if (!req) { resolve(null); return; }
        req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
        req.onsuccess = () => {
          const db = req.result;
          if (db.objectStoreNames.contains(STORE)) { db.onversionchange = () => db.close(); resolve(db); return; }
          const next = db.version + 1;
          db.close();
          if (version) resolve(null); else void attempt(next).then(resolve);
        };
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch { resolve(null); }
    });
    this.db ??= attempt();
    return this.db;
  }

  private run<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error ?? req.error);
      tx.onabort = () => reject(tx.error ?? new Error("aborted"));
    });
  }

  async get(key: string): Promise<string | null> {
    const db = await this.open();
    if (!db) return this.legacy.get(key);
    const v = await this.run<unknown>(db, "readonly", s => s.get(this.prefix + key)).catch(() => undefined);
    if (typeof v === "string") return v;
    const old = await this.legacy.get(key);
    if (old != null) {
      try { await this.run(db, "readwrite", s => s.put(old, this.prefix + key)); await this.legacy.delete(key); } catch { /* keep it where it is */ }
    }
    return old;
  }

  async set(key: string, value: string): Promise<void> {
    const db = await this.open();
    if (!db) return this.legacy.set(key, value);
    try {
      await this.run(db, "readwrite", s => s.put(value, this.prefix + key));
    } catch (err) {
      if ((err as DOMException | null)?.name === "QuotaExceededError") throw new DolphinError("storage_full", "The browser storage is full.");
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    const db = await this.open();
    if (db) await this.run(db, "readwrite", s => s.delete(this.prefix + key)).catch(() => undefined);
    await this.legacy.delete(key);
  }
}
