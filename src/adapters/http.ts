/**
 * Adapters for proxy mode: the browser talks to a DOLPHin server (Node, PHP, Python…)
 * that holds the keys. Contract: openapi.yaml.
 */
import { DolphinError, type DolphinErrorCode } from "../core/errors.js";
import { parseAnalysis } from "../core/analysis.js";
import { parseDrafts } from "../core/schema.js";
import type { AnalyzeResult, BrandProfile, GenerateRequest, GenerateResult, SiteSnapshot } from "../core/types.js";
import type { LlmPort, PublishInput, PublisherPort } from "../ports/index.js";

export interface HttpOptions {
  /** Base URL of the server, e.g. https://api.example.com/dolphin */
  endpoint: string;
  /** Optional bearer token, checked by the server. */
  token?: string;
  fetch?: typeof fetch;
}

async function call<T>(o: HttpOptions, method: string, path: string, body?: unknown): Promise<T> {
  const f = o.fetch ?? globalThis.fetch.bind(globalThis);
  let res: Response;
  try {
    res = await f(o.endpoint.replace(/\/+$/, "") + path, {
      method,
      headers: { "content-type": "application/json", ...(o.token ? { authorization: `Bearer ${o.token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new DolphinError("network", "Cannot reach the DOLPHin server.");
  }
  const data = (await res.json().catch(() => null)) as { error?: { code?: DolphinErrorCode; message?: string } } | null;
  if (!res.ok) throw new DolphinError(data?.error?.code ?? "unknown", data?.error?.message ?? `Server error ${res.status}.`, res.status);
  return data as T;
}

export class HttpLlm implements LlmPort {
  constructor(private readonly opts: HttpOptions) {}

  async generate(brand: BrandProfile, request: GenerateRequest): Promise<GenerateResult> {
    const r = await call<GenerateResult>(this.opts, "POST", "/v1/generate", { brand, request });
    return { drafts: parseDrafts({ posts: r.drafts }), usage: r.usage, model: r.model };
  }

  async analyze(snapshot: SiteSnapshot, brand?: BrandProfile): Promise<AnalyzeResult> {
    const r = await call<AnalyzeResult>(this.opts, "POST", "/v1/analyze", { snapshot, ...(brand ? { brand } : {}) });
    return { ...parseAnalysis(r), usage: r.usage, model: r.model };
  }
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export class HttpPublisher implements PublisherPort {
  constructor(private readonly opts: HttpOptions) {}

  async publish(input: PublishInput): Promise<{ id: string }> {
    return call<{ id: string }>(this.opts, "POST", "/v1/publish", {
      imageBase64: await blobToBase64(input.image),
      caption: input.caption,
      ...(input.scheduledAt ? { scheduledAt: input.scheduledAt.toISOString() } : {}),
    });
  }

  verify(): Promise<{ name: string }> {
    return call<{ name: string }>(this.opts, "GET", "/v1/publisher");
  }
}
