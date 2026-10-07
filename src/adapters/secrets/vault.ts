// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Yassine Chaabane. Commercial license: COMMERCIAL-LICENSE.md
import { DolphinError } from "../../core/errors.js";
import type { KeyValueStore } from "../../ports/index.js";

/** Secrets used in direct mode. In proxy mode they live on the server instead. */
export interface StudioSecrets {
  claudeKey?: string;
  metaPageId?: string;
  metaToken?: string;
}

/** OWASP 2023 recommendation for PBKDF2-SHA256. Vaults made with 310 000 still open. */
export const ITERATIONS = 600_000;
const LEGACY_ITERATIONS = 310_000;
const KEY = "vault";
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (u8: Uint8Array) => btoa(String.fromCharCode(...u8));
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
}

/** Secrets encrypted at rest with AES-GCM 256, key derived from a passphrase (PBKDF2-SHA256). */
export class Vault {
  private failures = 0;
  private lockedUntil = 0;
  constructor(private readonly store: KeyValueStore, private readonly now: () => number = Date.now) {}

  /** Milliseconds to wait before the next try, after 3 wrong passphrases in a row (2 s, 4 s… up to 60 s). */
  get retryInMs(): number { return Math.max(0, this.lockedUntil - this.now()); }

  async exists(): Promise<boolean> { return (await this.store.get(KEY)) != null; }

  async seal(passphrase: string, secrets: StudioSecrets): Promise<void> {
    if (passphrase.length < 8) throw new DolphinError("invalid_request", "The passphrase needs at least 8 characters.");
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(passphrase, salt, ITERATIONS);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(secrets))));
    await this.store.set(KEY, JSON.stringify({ v: 2, i: ITERATIONS, salt: b64(salt), iv: b64(iv), ct: b64(ct) }));
  }

  async open(passphrase: string): Promise<StudioSecrets> {
    const raw = await this.store.get(KEY);
    if (!raw) throw new DolphinError("not_configured", "No vault on this device.");
    if (this.retryInMs > 0) throw new DolphinError("rate_limit", "Too many wrong passphrases: wait a moment.");
    let secrets: StudioSecrets;
    let iterations = LEGACY_ITERATIONS;
    try {
      const v = JSON.parse(raw) as { i?: number; salt: string; iv: string; ct: string };
      iterations = Number.isInteger(v.i) && v.i! >= 100_000 && v.i! <= 5_000_000 ? v.i! : LEGACY_ITERATIONS;
      const key = await deriveKey(passphrase, unb64(v.salt), iterations);
      const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(v.iv) }, key, unb64(v.ct));
      secrets = JSON.parse(dec.decode(pt)) as StudioSecrets;
    } catch {
      this.failures++;
      if (this.failures >= 3) this.lockedUntil = this.now() + Math.min(60_000, 1000 * 2 ** (this.failures - 2));
      throw new DolphinError("auth", "Wrong passphrase.");
    }
    this.failures = 0; this.lockedUntil = 0;
    // an old vault is re-encrypted with today's iteration count
    if (iterations < ITERATIONS) await this.seal(passphrase, secrets).catch(() => undefined);
    return secrets;
  }

  async reset(): Promise<void> { await this.store.delete(KEY); }
}
