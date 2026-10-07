import { DolphinError } from "../../core/errors.js";
import type { KeyValueStore } from "../../ports/index.js";

/** Secrets used in direct mode. In proxy mode they live on the server instead. */
export interface StudioSecrets {
  claudeKey?: string;
  metaPageId?: string;
  metaToken?: string;
}

const ITERATIONS = 310_000;
const KEY = "vault";
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (u8: Uint8Array) => btoa(String.fromCharCode(...u8));
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: ITERATIONS, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
}

/** Secrets encrypted at rest with AES-GCM 256, key derived from a passphrase (PBKDF2-SHA256). */
export class Vault {
  constructor(private readonly store: KeyValueStore) {}

  async exists(): Promise<boolean> { return (await this.store.get(KEY)) != null; }

  async seal(passphrase: string, secrets: StudioSecrets): Promise<void> {
    if (passphrase.length < 8) throw new DolphinError("invalid_request", "The passphrase needs at least 8 characters.");
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(passphrase, salt);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(secrets))));
    await this.store.set(KEY, JSON.stringify({ v: 1, salt: b64(salt), iv: b64(iv), ct: b64(ct) }));
  }

  async open(passphrase: string): Promise<StudioSecrets> {
    const raw = await this.store.get(KEY);
    if (!raw) throw new DolphinError("not_configured", "No vault on this device.");
    try {
      const v = JSON.parse(raw) as { salt: string; iv: string; ct: string };
      const key = await deriveKey(passphrase, unb64(v.salt));
      const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(v.iv) }, key, unb64(v.ct));
      return JSON.parse(dec.decode(pt)) as StudioSecrets;
    } catch {
      throw new DolphinError("auth", "Wrong passphrase.");
    }
  }

  async reset(): Promise<void> { await this.store.delete(KEY); }
}
