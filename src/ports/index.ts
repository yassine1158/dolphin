// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Yassine Chaabane. Commercial license: COMMERCIAL-LICENSE.md
/**
 * Ports: what the application needs from the outside world.
 * Adapters (Claude, Meta, HTTP proxy, storage…) implement them; the core never imports an adapter.
 */
import type { AnalyzeResult, BrandProfile, GenerateRequest, GenerateResult, Post, SiteSnapshot } from "../core/types.js";

export interface LlmPort {
  generate(brand: BrandProfile, request: GenerateRequest): Promise<GenerateResult>;
  /** Understands a website: proposes a brand profile (when none is given) and post ideas. */
  analyze(snapshot: SiteSnapshot, brand?: BrandProfile): Promise<AnalyzeResult>;
}

export interface PublishInput {
  image: Blob;
  caption: string;
  /** Absent: publish now. */
  scheduledAt?: Date;
}

export interface PublisherPort {
  publish(input: PublishInput): Promise<{ id: string }>;
  /** Checks the connection and returns the page name. */
  verify?(): Promise<{ name: string }>;
}

export interface PosterRenderer {
  render(post: Post, brand: BrandProfile): Promise<Blob>;
}

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}
