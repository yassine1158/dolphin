import { validateBrand } from "../core/brand.js";
import { DolphinError, isDolphinError } from "../core/errors.js";
import { MAX_POSTS, fullCaption } from "../core/schema.js";
import { assertSchedulable, planSchedule } from "../core/schedule.js";
import type { AnalyzeResult, BrandProfile, GenerateRequest, Post, PostDraft, PostIdea, SiteSnapshot, Usage } from "../core/types.js";
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
  /** HH:MM, local time. Default 19:00. */
  time?: string;
  everyDays?: number;
}

export interface SendReport {
  sent: string[];
  failed: { id: string; error: DolphinError }[];
}

type Listener = (posts: readonly Post[]) => void;

const EDITABLE: readonly (keyof PostDraft | "scheduledAt")[] =
  ["tag", "title", "subtitle", "points", "style", "theme", "caption", "hashtags", "scheduledAt"];

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
      this.posts = await read<Post[]>(this.key, []);
      this.ideaList = await read<PostIdea[]>(`ideas:${this.ns}`, []);
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
    const result = await this.deps.llm.generate(this.brand, { ...opts, count, avoidTitles });
    const now = this.now();
    const start = opts.startDate ?? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const slots = planSchedule(result.drafts.length, start, opts.time, opts.everyDays);
    const created = result.drafts.map((d, i): Post => ({
      ...d, id: this.newId(), createdAt: now.toISOString(), scheduledAt: slots[i]!.toISOString(), status: "draft",
    }));
    this.posts = [...this.posts, ...created];
    await this.save();
    return { posts: created, usage: result.usage, model: result.model };
  }

  async update(id: string, patch: Partial<Pick<Post, (typeof EDITABLE)[number]>>): Promise<Post> {
    const post = this.require(id);
    if (post.status !== "draft" && post.status !== "failed") throw new DolphinError("invalid_request", "This post was already sent.");
    const clean = Object.fromEntries(Object.entries(patch).filter(([k]) => (EDITABLE as readonly string[]).includes(k)));
    const next: Post = { ...post, ...clean };
    this.posts = this.posts.map(p => (p.id === id ? next : p));
    await this.save();
    return next;
  }

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

  caption(id: string): string { return fullCaption(this.require(id)); }

  /** Publishes now (`schedule: false`) or at each post's `scheduledAt`. */
  async send(ids: readonly string[], schedule: boolean): Promise<SendReport> {
    const publisher = this.deps.publisher;
    if (!publisher) throw new DolphinError("not_configured", "No publishing account is connected.");
    const report: SendReport = { sent: [], failed: [] };
    for (const id of ids) {
      const post = this.get(id);
      if (!post || (post.status !== "draft" && post.status !== "failed")) continue;
      try {
        const at = schedule ? new Date(post.scheduledAt) : undefined;
        if (at) assertSchedulable(at, this.now());
        const image = await this.deps.renderer.render(post, this.brand);
        const { id: externalId } = await publisher.publish({ image, caption: fullCaption(post), ...(at ? { scheduledAt: at } : {}) });
        this.replace({ ...post, status: schedule ? "scheduled" : "published", externalId, error: undefined, errorCode: undefined });
        report.sent.push(id);
      } catch (err) {
        const error = isDolphinError(err) ? err : new DolphinError("unknown", err instanceof Error ? err.message : String(err));
        this.replace({ ...post, status: "failed", error: error.message, errorCode: error.code });
        report.failed.push({ id, error });
      }
      await this.save();
    }
    return report;
  }

  sendAllScheduled(): Promise<SendReport> {
    return this.send(this.posts.filter(p => p.status === "draft" || p.status === "failed").map(p => p.id), true);
  }

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
