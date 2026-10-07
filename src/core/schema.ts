// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Yassine Chaabane. Commercial license: COMMERCIAL-LICENSE.md
import { DolphinError } from "./errors.js";
import type { PointStyle, PostDraft, PosterTheme } from "./types.js";

export const MAX_POSTS = 10;
export const MAX_POINTS = 5;
const THEMES: readonly PosterTheme[] = ["dark", "light", "accent"];
const STYLES: readonly PointStyle[] = ["checks", "steps"];

/** JSON Schema given to the model as structured output format. */
export const POSTS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["posts"],
  properties: {
    posts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["tag", "title", "subtitle", "points", "style", "theme", "caption", "hashtags"],
        properties: {
          tag: { type: "string", description: "Short label on top of the poster, 1 to 3 words." },
          title: { type: "string", description: "Poster headline, 45 characters at most." },
          subtitle: { type: "string", description: "Short line under the title, 60 characters at most. Empty string if not useful." },
          points: { type: "array", items: { type: "string" }, description: "2 to 4 short points for the poster, 38 characters at most each." },
          style: { type: "string", enum: [...STYLES], description: "steps for ordered advice or steps, checks otherwise." },
          theme: { type: "string", enum: [...THEMES], description: "Poster colors; alternate from one post to the next." },
          caption: { type: "string", description: "Post text: 3 to 7 short lines, a few emojis, ends with the call to action and the contact." },
          hashtags: { type: "array", items: { type: "string" }, description: "3 to 6 hashtags without the # sign." },
        },
      },
    },
  },
} as const;

const str = (v: unknown, max = 2000): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const strList = (v: unknown, maxItems: number, maxLen = 200): string[] =>
  Array.isArray(v) ? v.map(x => str(x, maxLen)).filter(Boolean).slice(0, maxItems) : [];

/** Normalizes one hashtag: no #, no spaces. */
export const cleanHashtag = (h: string): string => h.replace(/^#+/, "").replace(/\s+/g, "");

/**
 * Validates and normalizes the model output. The schema is enforced by the API,
 * but the client never trusts it blindly: anything unusable raises `invalid_output`.
 */
export function parseDrafts(value: unknown): PostDraft[] {
  const posts = (value as { posts?: unknown } | null)?.posts;
  if (!Array.isArray(posts)) throw new DolphinError("invalid_output", "The model answer has no posts array.");
  const drafts = posts.slice(0, MAX_POSTS).map((raw): PostDraft => {
    const p = (raw ?? {}) as Record<string, unknown>;
    return {
      tag: str(p.tag, 40),
      title: str(p.title, 120),
      subtitle: str(p.subtitle, 160),
      points: strList(p.points, MAX_POINTS, 120),
      style: STYLES.includes(p.style as PointStyle) ? (p.style as PointStyle) : "checks",
      theme: THEMES.includes(p.theme as PosterTheme) ? (p.theme as PosterTheme) : "dark",
      caption: str(p.caption, 2200),
      hashtags: strList(p.hashtags, 10, 60).map(cleanHashtag).filter(Boolean),
    };
  }).filter(d => d.title && d.caption);
  if (!drafts.length) throw new DolphinError("invalid_output", "The model answer contains no usable post.");
  return drafts;
}

/** Caption as published: text, blank line, hashtags. */
export const fullCaption = (p: Pick<PostDraft, "caption" | "hashtags">): string =>
  [p.caption.trim(), p.hashtags.map(h => "#" + cleanHashtag(h)).join(" ")].filter(Boolean).join("\n\n");
