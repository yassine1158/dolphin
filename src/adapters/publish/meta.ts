// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Yassine Chaabane. Commercial license: COMMERCIAL-LICENSE.md
import { DolphinError } from "../../core/errors.js";
import type { EngagementSample } from "../../core/peak.js";
import { assertSchedulable } from "../../core/schedule.js";
import type { PublishInput, PublisherPort } from "../../ports/index.js";

export interface MetaPageOptions {
  pageId: string;
  /** Page access token with pages_manage_posts. */
  accessToken: string;
  graphVersion?: string;
  /**
   * App secret of the Meta app that issued the token (server side only). When set, every call carries
   * appsecret_proof, so a stolen token cannot be used without the secret. Enable "Require App Secret" in the app.
   */
  appSecret?: string;
  fetch?: typeof fetch;
}

/** HMAC-SHA256 of the token with the app secret, hex (Meta's appsecret_proof). */
export async function appSecretProof(token: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(token)));
  return Array.from(sig, b => b.toString(16).padStart(2, "0")).join("");
}

interface GraphError { code?: number; message?: string }

/** Publishes a photo post on a Facebook Page through the Graph API (now or scheduled). */
export class MetaPagePublisher implements PublisherPort {
  private readonly base: string;

  constructor(private readonly opts: MetaPageOptions) {
    if (!opts.pageId || !opts.accessToken) throw new DolphinError("not_configured", "Facebook page id and access token are required.");
    this.base = `https://graph.facebook.com/${opts.graphVersion ?? "v23.0"}/${encodeURIComponent(opts.pageId)}`;
  }

  async publish({ image, caption, scheduledAt }: PublishInput): Promise<{ id: string }> {
    const form = new FormData();
    form.append("source", image, image.type === "image/jpeg" ? "dolphin.jpg" : "dolphin.png");
    form.append("message", caption);
    form.append("access_token", this.opts.accessToken); // in the body, not in the URL
    if (scheduledAt) {
      assertSchedulable(scheduledAt);
      form.append("published", "false");
      form.append("unpublished_content_type", "SCHEDULED");
      form.append("scheduled_publish_time", String(Math.floor(scheduledAt.getTime() / 1000)));
    }
    const data = await this.request<{ id?: string; post_id?: string }>(`${this.base}/photos`, { method: "POST", body: form });
    return { id: data.post_id ?? data.id ?? "" };
  }

  async verify(): Promise<{ name: string }> {
    const data = await this.request<{ name?: string }>(`${this.base}?fields=name`, { method: "GET" });
    return { name: data.name ?? "" };
  }

  /**
   * Published posts with their reactions, comments and shares (needs pages_read_engagement):
   * up to `max` posts (default 300), following Facebook's pages of 100.
   */
  async history(max = 300): Promise<EngagementSample[]> {
    const fields = "created_time,message,permalink_url,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)";
    type Row = { created_time?: string; message?: string; permalink_url?: string; shares?: { count?: number }; reactions?: { summary?: { total_count?: number } }; comments?: { summary?: { total_count?: number } } };
    const rows: Row[] = [];
    let url: string | undefined = `${this.base}/published_posts?fields=${encodeURIComponent(fields)}&limit=100`;
    while (url && rows.length < max) {
      const data: { data?: Row[]; paging?: { next?: string } } = await this.request(url, { method: "GET" });
      rows.push(...(data.data ?? []));
      const next = data.paging?.next;
      // follow Facebook's own "next" link only (same host), without the token it may carry
      url = next && new URL(next).host === "graph.facebook.com" ? stripToken(next) : undefined;
    }
    return rows.slice(0, max).filter(r => r.created_time).map(r => ({
      createdTime: r.created_time!,
      reactions: r.reactions?.summary?.total_count ?? 0,
      comments: r.comments?.summary?.total_count ?? 0,
      shares: r.shares?.count ?? 0,
      ...(r.message ? { message: r.message.slice(0, 200) } : {}),
      ...(r.permalink_url?.startsWith("https://") ? { url: r.permalink_url } : {}),
    }));
  }

  /**
   * POST sends the token in the form body; GET puts it in the query, as Facebook's CORS rules
   * require in a browser. URLs with a token are never logged nor put in an error message.
   */
  private async request<T>(url: string, init: RequestInit): Promise<T> {
    const f = this.opts.fetch ?? globalThis.fetch.bind(globalThis);
    const u = new URL(url);
    const proof = this.opts.appSecret ? await appSecretProof(this.opts.accessToken, this.opts.appSecret) : "";
    if (init.body instanceof FormData) { if (proof) init.body.set("appsecret_proof", proof); }
    else {
      u.searchParams.set("access_token", this.opts.accessToken);
      if (proof) u.searchParams.set("appsecret_proof", proof);
    }
    let res: Response;
    try { res = await f(u.href, init); } catch { throw new DolphinError("network", "Cannot reach Facebook."); }
    const data = (await res.json().catch(() => ({}))) as T & { error?: GraphError };
    if (!res.ok || data.error) throw graphError(data.error ?? {}, res.status);
    return data;
  }
}

export function graphError(e: GraphError, status?: number): DolphinError {
  const msg = e.message ?? "Facebook error.";
  switch (e.code) {
    case 190: return new DolphinError("auth", "The page token is invalid or expired.", status);
    case 3: case 10: case 200: return new DolphinError("permission", "The token lacks pages_manage_posts for this page.", status);
    case 4: case 32: case 368: return new DolphinError("rate_limit", "Facebook is temporarily limiting posts.", status);
    case 100: return /schedul/i.test(msg)
      ? new DolphinError("schedule_window", "The date must be between 10 minutes and 30 days from now.", status)
      : new DolphinError("invalid_request", "Wrong page id, or the page is not reachable with this token.", status);
    default: return new DolphinError("unknown", msg, status);
  }
}

function stripToken(link: string): string {
  const u = new URL(link);
  u.searchParams.delete("access_token");
  u.searchParams.delete("appsecret_proof");
  return u.href;
}
