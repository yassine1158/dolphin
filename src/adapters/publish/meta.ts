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
  fetch?: typeof fetch;
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
    form.append("source", image, "dolphin.png");
    form.append("message", caption);
    form.append("access_token", this.opts.accessToken);
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
    const url = `${this.base}?fields=name&access_token=${encodeURIComponent(this.opts.accessToken)}`;
    const data = await this.request<{ name?: string }>(url, { method: "GET" });
    return { name: data.name ?? "" };
  }

  /** Last 100 published posts with their reactions, comments and shares (needs pages_read_engagement). */
  async history(): Promise<EngagementSample[]> {
    const fields = "created_time,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)";
    const url = `${this.base}/published_posts?fields=${encodeURIComponent(fields)}&limit=100&access_token=${encodeURIComponent(this.opts.accessToken)}`;
    type Row = { created_time?: string; shares?: { count?: number }; reactions?: { summary?: { total_count?: number } }; comments?: { summary?: { total_count?: number } } };
    const data = await this.request<{ data?: Row[] }>(url, { method: "GET" });
    return (data.data ?? []).filter(r => r.created_time).map(r => ({
      createdTime: r.created_time!,
      reactions: r.reactions?.summary?.total_count ?? 0,
      comments: r.comments?.summary?.total_count ?? 0,
      shares: r.shares?.count ?? 0,
    }));
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    const f = this.opts.fetch ?? globalThis.fetch.bind(globalThis);
    let res: Response;
    try { res = await f(url, init); } catch { throw new DolphinError("network", "Cannot reach Facebook."); }
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
