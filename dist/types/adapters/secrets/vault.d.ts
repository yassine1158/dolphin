import type { KeyValueStore } from "../../ports/index.js";
/** Secrets used in direct mode. In proxy mode they live on the server instead. */
export interface StudioSecrets {
    claudeKey?: string;
    metaPageId?: string;
    metaToken?: string;
}
/** OWASP 2023 recommendation for PBKDF2-SHA256. Vaults made with 310 000 still open. */
export declare const ITERATIONS = 600000;
/** Secrets encrypted at rest with AES-GCM 256, key derived from a passphrase (PBKDF2-SHA256). */
export declare class Vault {
    private readonly store;
    private readonly now;
    private failures;
    private lockedUntil;
    constructor(store: KeyValueStore, now?: () => number);
    /** Milliseconds to wait before the next try, after 3 wrong passphrases in a row (2 s, 4 s… up to 60 s). */
    get retryInMs(): number;
    exists(): Promise<boolean>;
    seal(passphrase: string, secrets: StudioSecrets): Promise<void>;
    open(passphrase: string): Promise<StudioSecrets>;
    reset(): Promise<void>;
}
