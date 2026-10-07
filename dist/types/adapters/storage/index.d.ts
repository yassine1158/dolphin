import type { KeyValueStore } from "../../ports/index.js";
export declare class MemoryStore implements KeyValueStore {
    private readonly map;
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
}
/**
 * Browser localStorage, namespaced. Private windows or blocked storage fall back to memory,
 * so the studio keeps working for the current visit.
 */
export declare class LocalStore implements KeyValueStore {
    private readonly prefix;
    private readonly fallback;
    /** Keys whose last write did not reach localStorage: their stored value is stale. */
    private readonly memoryOnly;
    constructor(prefix?: string);
    private ls;
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
}
/**
 * IndexedDB, namespaced: room for background photos and long histories (localStorage holds ~5 MB).
 * Data written by older versions in localStorage is moved here the first time it is read.
 * Without IndexedDB (old browser, blocked storage) it falls back to LocalStore.
 */
export declare class IdbStore implements KeyValueStore {
    private readonly prefix;
    private readonly name;
    private readonly legacy;
    private db;
    constructor(prefix?: string, name?: string);
    private open;
    private run;
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
}
