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
    constructor(prefix?: string);
    private ls;
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
}
