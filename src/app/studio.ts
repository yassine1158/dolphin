// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Yassine Chaabane. Commercial license: COMMERCIAL-LICENSE.md
import { validateBrand } from "../core/brand.js";
import { DolphinError, isDolphinError } from "../core/errors.js";
import { captionWithLink, planToCsv } from "../core/campaign.js";
import { importEngagementCsv, type ImportResult } from "../core/csv.js";
import { safeLink, sanitizeDesign, sanitizePost } from "../core/design.js";
import { analyzeInsights, mergeSources, type InsightsReport } from "../core/insights.js";
import { MAX_POINTS, MAX_POSTS, cleanHashtag } from "../core/schema.js";
import { analyzePeaks, planWithPeaks, type EngagementSample, type PeakReport } from "../core/peak.js";
import { assertSchedulable, planSchedule } from "../core/schedule.js";
import type { AnalyzeResult, BrandProfile, GenerateRequest, Post, PosterDesign, PostDraft, PostIdea, SiteSnapshot, Usage } from "../core/types.js";
import type { KeyValueStore, LlmPort, PosterRenderer, PublisherPort } from "../ports/index.js";

export interface StudioDeps {
  brand: BrandProfile;
  renderer: PosterRenderer;
  store: KeyValueStore;
  llm?: LlmPort;
  publisher?: PublisherPort;
  now?: () => Date;
  newId?: () => string;
  /** The host owns the brand (e.g. built from its CMS): the studio never replaces it. */
  brandLocked?: boolean;
}

export interface GenerateOptions extends GenerateRequest {
  /** First day of the plan (date part is used). Default: tomorrow. */
  startDate?: Date;
  /** HH:MM, local time, or "auto": each post at the peak time of its weekday. Default 19:00. */
  time?: string;
  everyDays?: number;
  /** Campaign name stored on each new post (groups posts, tags links). */
  campaign?: string;
  /** Link added to each caption, with UTM parameters. */
  link?: string;
  /** Design applied to each new poster. */
  design?: PosterDesign;
}

/** Where the imported data came from, kept with the samples. */
export interface ImportedData {
  kind: ImportResult["kind"];
  samples: EngagementSample[];
  fileName?: string;
  importedAt: string;
  undated?: boolean;
}

/** Largest import kept on the device. */
const MAX_IMPORTED = 5000;

export interface SendReport {
  sent: string[];
  failed: { id: string; error: DolphinError }[];
}

type Listener = (posts: readonly Post[]) => void;

const EDITABLE: readonly (keyof PostDraft | "scheduledAt" | "design" | "campaign" | "link")[] =
  ["tag", "title", "subtitle", "points", "style", "theme", "caption", "hashtags", "scheduledAt", "design", "campaign", "link"];
type Patch = Partial<Pick<Post, (typeof EDITABLE)[number]>>;

/**
 * Application service: every use case of the studio, independent of any UI or vendor.
 */
export class DolphinStudio {
  private posts: Post[] = [];
  private readonly listeners = new Set<Listener>();
  private readonly key: string;
  private readonly now: () => Date;
  private readonly newId: () => string;
  private loaded = false;
  private ideaList: PostIdea[] = [];
  private peakReport: PeakReport | null = null;
  private insightsReport: InsightsReport | null = null;
  private imported: ImportedData | null = null;
  /** Posts being sent right now: a second click never publishes them twice. */
  private readonly sending = new Set<string>();
  private readonly ns: string;

  constructor(private deps: StudioDeps) {
    this.ns = deps.brand.id;
    this.key = `posts:${this.ns}`;
    this.now = deps.now ?? (() => new Date());
    this.newId = deps.newId ?? (() => globalThis.crypto.randomUUID());
  }

  get brand(): BrandProfile { return this.deps.brand; }
  get canGenerate(): boolean { return !!this.deps.llm; }
  get canPublish(): boolean { return !!this.deps.publisher; }

  /** Swap adapters at runtime (e.g. after the user unlocks their keys). */
  connect(adapters: Pick<StudioDeps, "llm" | "publisher">): void {
    this.deps = { ...this.deps, ...adapters };
    this.emit();
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  get brandLocked(): boolean { return !!this.deps.brandLocked; }
  get ideas(): readonly PostIdea[] { return this.ideaList; }
  /** True once the owner saved a profile (or the host provides one). */
  hasSavedBrand = false;

  async load(): Promise<readonly Post[]> {
    if (!this.loaded) {
      const read = async <T>(k: string, d: T): Promise<T> => { try { return (JSON.parse((await this.deps.store.get(k)) ?? "null") as T) ?? d; } catch { return d; } };
      const stored = await read<unknown>(this.key, []);
      this.posts = (Array.isArray(stored) ? stored : []).map(sanitizePost).filter((p): p is Post => !!p);
      const ideas = await read<unknown>(`ideas:${this.ns}`, []);
      this.ideaList = Array.isArray(ideas) ? (ideas as PostIdea[]).filter(i => i && typeof i.title === "string") : [];
      this.peakReport = await read<PeakReport | null>(`peaks:${this.ns}`, null);
      if (!Array.isArray(this.peakReport?.grid) || this.peakReport.grid.length !== 7) this.peakReport = null;
      this.insightsReport = await read<InsightsReport | null>(`insights:${this.ns}`, null);
      this.imported = await read<ImportedData | null>(`imported:${this.ns}`, null);
      if (!Array.isArray(this.imported?.samples)) this.imported = null;
      if (this.brandLocked) this.hasSavedBrand = true;
      else {
        const saved = await read<unknown>(`brand:${this.ns}`, null);
        if (saved) { try { this.deps = { ...this.deps, brand: validateBrand(saved) }; this.hasSavedBrand = true; } catch { /* ignore a broken profile */ } }
      }
      this.loaded = true;
    }
    return this.list();
  }

  /** Saves the brand profile edited by the owner. */
  async setBrand(brand: BrandProfile): Promise<BrandProfile> {
    if (this.brandLocked) throw new DolphinError("invalid_request", "The brand is managed by the host site.");
    const valid = validateBrand({ ...brand, id: this.ns });
    this.deps = { ...this.deps, brand: valid };
    this.hasSavedBrand = true;
    await this.deps.store.set(`brand:${this.ns}`, JSON.stringify(valid));
    this.emit();
    return valid;
  }

  get peaks(): PeakReport | null { return this.peakReport; }
  get insights(): InsightsReport | null { return this.insightsReport; }
  get importedData(): Readonly<ImportedData> | null { return this.imported; }

  /**
   * Peak times and insights from the page's own posts (when the publisher can read them) and from
   * the imported file, put on the same scale. Without enough data: the general recommendation.
   */
  async peakTimes(): Promise<PeakReport> {
    let page: EngagementSample[] = [];
    if (this.deps.publisher?.history) {
      try { page = await this.deps.publisher.history(); } catch { page = []; }
    }
    const file = this.imported?.samples ?? [];
    const samples = page.length && file.length ? mergeSources(page, file) : page.length ? page : file;
    const from = page.length && file.length ? "mixed" : page.length ? "page" : "import";
    this.peakReport = analyzePeaks(samples, undefined, from);
    // an undated ads report repeats each hour on every day: it helps the hours, never the day insights
    const forInsights = this.imported?.undated ? page : samples;
    this.insightsReport = samples.length ? analyzeInsights(forInsights, this.now()) : null;
    await this.deps.store.set(`peaks:${this.ns}`, JSON.stringify(this.peakReport));
    await this.deps.store.set(`insights:${this.ns}`, JSON.stringify(this.insightsReport));
    this.emit();
    return this.peakReport;
  }

  /** Imports a CSV export (Meta Business Suite posts, Ads Manager by hour…) and recomputes the peaks. */
  async importCsv(text: string, fileName?: string): Promise<ImportResult> {
    const result = importEngagementCsv(text);
    this.imported = {
      kind: result.kind, samples: result.samples.slice(-MAX_IMPORTED), importedAt: this.now().toISOString(),
      ...(fileName ? { fileName: fileName.slice(0, 120) } : {}), ...(result.undated ? { undated: true } : {}),
    };
    await this.deps.store.set(`imported:${this.ns}`, JSON.stringify(this.imported));
    await this.peakTimes();
    return result;
  }

  async clearImport(): Promise<void> {
    this.imported = null;
    await this.deps.store.delete(`imported:${this.ns}`);
    await this.peakTimes();
  }

  /** Reads the site through the model: a brand proposal (unless locked) and post ideas. */
  async analyze(snapshot: SiteSnapshot): Promise<AnalyzeResult> {
    if (!this.deps.llm) throw new DolphinError("not_configured", "No language model is connected.");
    const result = await this.deps.llm.analyze(snapshot, this.brandLocked || this.hasSavedBrand ? this.brand : undefined);
    this.ideaList = result.ideas;
    await this.deps.store.set(`ideas:${this.ns}`, JSON.stringify(result.ideas));
    this.emit();
    return result;
  }

  list(): readonly Post[] { return this.posts; }
  get(id: string): Post | undefined { return this.posts.find(p => p.id === id); }

  async generate(opts: GenerateOptions): Promise<{ posts: Post[]; usage: Usage; model: string }> {
    if (!this.deps.llm) throw new DolphinError("not_configured", "No language model is connected.");
    const count = Math.min(MAX_POSTS, Math.max(1, Math.floor(opts.count)));
    const avoidTitles = [...(opts.avoidTitles ?? []), ...this.posts.slice(-15).map(p => p.title)];
    // only the request fields go to the model: scheduling and design stay here
    const request: GenerateRequest = { count, avoidTitles };
    for (const k of ["subject", "tone", "notes", "objective", "audience", "offer"] as const) if (opts[k]) (request as unknown as Record<string, unknown>)[k] = opts[k];
    const result = await this.deps.llm.generate(this.brand, request);
    const now = this.now();
    const start = opts.startDate ?? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const drafts = result.drafts.slice(0, count); // never more than asked, whatever the model returns
    const slots = opts.time === "auto"
      ? planWithPeaks(drafts.length, start, this.peakReport ?? (await this.peakTimes()), opts.everyDays)
      : planSchedule(drafts.length, start, opts.time, opts.everyDays);
    const campaign = opts.campaign?.trim().slice(0, 80);
    const link = safeLink(opts.link);
    const design = opts.design ? sanitizeDesign(opts.design) : {};
    const created = drafts.map((d, i): Post => ({
      ...d, id: this.newId(), createdAt: now.toISOString(), scheduledAt: slots[i]!.toISOString(), status: "draft",
      ...(campaign ? { campaign } : {}), ...(link ? { link } : {}), ...(Object.keys(design).length ? { design } : {}),
    }));
    this.posts = [...this.posts, ...created];
    await this.save();
    return { posts: created, usage: result.usage, model: result.model };
  }

  async update(id: string, patch: Patch): Promise<Post> {
    const post = this.require(id);
    if (post.status !== "draft" && post.status !== "failed") throw new DolphinError("invalid_request", "This post was already sent.");
    if (this.sending.has(id)) throw new DolphinError("invalid_request", "This post is being sent.");
    const next = { ...post, ...cleanPatch(patch, post) } as Post;
    for (const k of ["design", "campaign", "link"] as const) if (next[k] === undefined) delete next[k];
    this.posts = this.posts.map(p => (p.id === id ? next : p));
    await this.save();
    return next;
  }

  /** Copies a post as a new draft, e.g. to make the story version of a feed poster. */
  async duplicate(id: string, design?: PosterDesign): Promise<Post> {
    const src = this.require(id);
    const copy: Post = { ...structuredClone(src), id: this.newId(), createdAt: this.now().toISOString(), status: "draft" };
    delete copy.externalId; delete copy.error; delete copy.errorCode;
    if (design) copy.design = { ...copy.design, ...sanitizeDesign(design) };
    const at = this.posts.findIndex(p => p.id === id);
    this.posts = [...this.posts.slice(0, at + 1), copy, ...this.posts.slice(at + 1)];
    await this.save();
    return copy;
  }

  /** The plan as CSV, for a spreadsheet or a client report. */
  exportCsv(): string { return planToCsv(this.posts); }

  async remove(id: string): Promise<void> {
    this.posts = this.posts.filter(p => p.id !== id);
    await this.save();
  }

  async clear(): Promise<void> {
    this.posts = [];
    await this.save();
  }

  renderImage(id: string): Promise<Blob> {
    return this.deps.renderer.render(this.require(id), this.brand);
  }

  caption(id: string): string { return captionWithLink(this.require(id)); }

  /** Publishes now (`schedule: false`) or at each post's `scheduledAt`. */
  async send(ids: readonly string[], schedule: boolean): Promise<SendReport> {
    const publisher = this.deps.publisher;
    if (!publisher) throw new DolphinError("not_configured", "No publishing account is connected.");
    const report: SendReport = { sent: [], failed: [] };
    for (const id of new Set(ids)) {
      const post = this.get(id);
      if (!post || (post.status !== "draft" && post.status !== "failed") || this.sending.has(id)) continue;
      this.sending.add(id);
      try {
        const at = schedule ? new Date(post.scheduledAt) : undefined;
        if (at) assertSchedulable(at, this.now());
        const image = await this.deps.renderer.render(post, this.brand);
        const { id: externalId } = await publisher.publish({ image, caption: captionWithLink(post), ...(at ? { scheduledAt: at } : {}) });
        this.replace({ ...post, status: schedule ? "scheduled" : "published", externalId, error: undefined, errorCode: undefined });
        report.sent.push(id);
      } catch (err) {
        const error = isDolphinError(err) ? err : new DolphinError("unknown", err instanceof Error ? err.message : String(err));
        this.replace({ ...post, status: "failed", error: error.message, errorCode: error.code });
        report.failed.push({ id, error });
      } finally {
        this.sending.delete(id);
      }
      await this.save();
    }
    return report;
  }

  sendAllScheduled(): Promise<SendReport> {
    return this.send(this.posts.filter(p => p.status === "draft" || p.status === "failed").map(p => p.id), true);
  }

  isSending(id: string): boolean { return this.sending.has(id); }

  private require(id: string): Post {
    const p = this.get(id);
    if (!p) throw new DolphinError("invalid_request", `Unknown post ${id}.`);
    return p;
  }

  private replace(post: Post): void {
    const clean = { ...post };
    if (clean.error === undefined) delete clean.error;
    if (clean.errorCode === undefined) delete clean.errorCode;
    this.posts = this.posts.map(p => (p.id === post.id ? clean : p));
  }

  private async save(): Promise<void> {
    await this.deps.store.set(this.key, JSON.stringify(this.posts));
    this.emit();
  }

  private emit(): void { for (const fn of this.listeners) fn(this.posts); }
}

/** Keeps editable fields only, with the right types: the UI and the host cannot corrupt a post. */
function cleanPatch(patch: Patch, post: Post): Partial<Post> {
  const out: Partial<Post> = {};
  const p = patch as Record<string, unknown>;
  const text = (k: "tag" | "title" | "subtitle" | "caption", max: number) => { if (typeof p[k] === "string") out[k] = (p[k] as string).slice(0, max); };
  text("tag", 40); text("title", 120); text("subtitle", 160); text("caption", 2200);
  if (Array.isArray(p.points)) out.points = p.points.filter((x): x is string => typeof x === "string").map(x => x.slice(0, 120)).slice(0, MAX_POINTS);
  if (Array.isArray(p.hashtags)) out.hashtags = p.hashtags.filter((x): x is string => typeof x === "string").map(cleanHashtag).filter(Boolean).slice(0, 10);
  if (p.style === "checks" || p.style === "steps") out.style = p.style;
  if (p.theme === "dark" || p.theme === "light" || p.theme === "accent") out.theme = p.theme;
  if ("scheduledAt" in p) {
    const d = new Date(String(p.scheduledAt));
    if (Number.isNaN(d.getTime())) throw new DolphinError("invalid_request", "scheduledAt must be a valid date.");
    out.scheduledAt = d.toISOString();
  }
  if ("design" in p) {
    const d = sanitizeDesign(p.design === null ? {} : { ...post.design, ...(p.design as object) });
    out.design = Object.keys(d).length ? d : undefined;
  }
  if ("campaign" in p) out.campaign = typeof p.campaign === "string" && p.campaign.trim() ? p.campaign.trim().slice(0, 80) : undefined;
  if ("link" in p) {
    const link = safeLink(p.link);
    if (p.link && !link) throw new DolphinError("invalid_request", "The link must start with https:// or http://.");
    out.link = link;
  }
  return out;
}
