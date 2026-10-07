import type { KeyValueStore } from "../../ports/index.js";
/** Secrets used in direct mode. In proxy mode they live on the server instead. */
export interface StudioSecrets {
    claudeKey?: string;
    metaPageId?: string;
    metaToken?: string;
}
/** Secrets encrypted at rest with AES-GCM 256, key derived from a passphrase (PBKDF2-SHA256). */
export declare class Vault {
    private readonly store;
    constructor(store: KeyValueStore);
    exists(): Promise<boolean>;
    seal(passphrase: string, secrets: StudioSecrets): Promise<void>;
    open(passphrase: string): Promise<StudioSecrets>;
    reset(): Promise<void>;
}
