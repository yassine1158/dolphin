import { HttpLlm, HttpPublisher } from "../adapters/http.js";
import { discoverSite, snapshotFromDocument } from "../adapters/site.js";
import { Vault, type StudioSecrets } from "../adapters/secrets/vault.js";
import { LocalStore } from "../adapters/storage/index.js";
import { DolphinStudio, type StudioDeps } from "../app/studio.js";
import { validateBrand } from "../core/brand.js";
import { DEFAULT_MODEL, estimatePerPostUsd, estimateCostUsd } from "../core/cost.js";
import { isDolphinError } from "../core/errors.js";
import { toLocalInput } from "../core/schedule.js";
import type { BrandProfile, Lang, Post, Product } from "../core/types.js";
import { DEFAULT_COLORS } from "../render/colors.js";
import { CanvasPosterRenderer, type PosterFonts } from "../render/poster.js";
import { MESSAGES, fill, type Messages } from "./i18n.js";
import { chooseLogo, logoFromFile } from "./logo.js";
import { PROFILE_STYLES, ideasCard, siteCard } from "./profile.js";
import { MARK_SVG, STYLES } from "./styles.js";

export interface DolphinConfig {
  /**
   * Brand profile owned by the host (built from its CMS, for example). Without it, DOLPHin reads
   * the website (`siteUrl`), proposes a profile with logo and colors, and the owner saves it.
   */
  brand?: BrandProfile;
  /** Page DOLPHin reads to understand the business. Default: the home page of this site. */
  siteUrl?: string;
  /** Storage namespace when no brand is given. Default: derived from the host name. */
  id?: string;
  /** "proxy" (recommended): keys on your server. "direct": keys typed in the browser, encrypted locally. */
  mode?: "proxy" | "direct";
  /** DOLPHin server URL (proxy mode). */
  endpoint?: string;
  /** Bearer token for the server (proxy mode). */
  token?: string;
  /** Interface language. Defaults to the brand language. */
  lang?: Lang;
  /** Claude model (direct mode). */
  model?: string;
  fonts?: PosterFonts;
  graphVersion?: string;
  /**
   * Direct mode with keys managed by the host page (it already has its own login and storage):
   * no passphrase screen. The host is told about new keys through `onSecretsChange`.
   */
  secrets?: StudioSecrets;
  onSecretsChange?: (secrets: StudioSecrets) => void | Promise<void>;
}

export type DirectFactory = (secrets: StudioSecrets, config: DolphinConfig) => Pick<StudioDeps, "llm" | "publisher">;

type View = "loading" | "setup" | "lock" | "main";
interface Prefs { subject: string; tone: string; count: number; start: string; time: string; notes: string }

/** Instructions sent to the model for each subject / tone choice. */
const SUBJECTS: Record<string, string> = {
  mix: "a balanced mix: selling what is available, useful tips, trust and behind the scenes, what is coming soon",
  sell: "selling the products that are available now",
  tips: "useful, accurate tips for the audience, leading to the available products",
  trust: "trust: care, seriousness and behind the scenes of the company",
  soon: "announcing the products coming soon, inviting people to be notified first",
};
const TONES: Record<string, string> = { warm: "warm and close to the audience", pro: "professional and reassuring", bold: "energetic, makes people act" };

const esc = (s: unknown): string => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Starting point when the host gives no brand: replaced by the profile the owner saves. */
function placeholderBrand(cfg: DolphinConfig): BrandProfile {
  const host = globalThis.location?.hostname || "site";
  const lang = (cfg.lang ?? document.documentElement.lang?.slice(0, 2)) as Lang;
  return {
    id: (cfg.id ?? host).toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 64) || "site",
    name: document.title.split(/[|·–-]/)[0]?.trim().slice(0, 80) || host,
    language: lang === "en" || lang === "ar" ? lang : "fr",
    contact: {}, products: [], colors: { ...DEFAULT_COLORS },
  };
}
const usd = (n: number): string => (n < 0.01 ? n.toFixed(3) : n.toFixed(2));

export class DolphinStudioElement extends HTMLElement {
  /** Set by the full bundle; the lite bundle only supports proxy mode. */
  static directFactory?: DirectFactory;

  private readonly root: ShadowRoot;
  private cfg?: DolphinConfig;
  private studio?: DolphinStudio;
  private renderer = new CanvasPosterRenderer();
  private store?: LocalStore;
  private vault?: Vault;
  private secrets: StudioSecrets | null = null;
  private passphrase = "";
  private view: View = "loading";
  private busy = false;
  private t: Messages = MESSAGES.fr;
  private prefs: Prefs = { subject: "mix", tone: "warm", count: 5, start: "", time: "19:00", notes: "" };
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private redraw = new Map<string, ReturnType<typeof setTimeout>>();
  /** Profile being reviewed before it is saved. */
  private draft: BrandProfile | null = null;
  private logoCandidates: string[] = [];
  private siteUrl = "";

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
    this.root.addEventListener("click", e => void this.onClick(e));
    this.root.addEventListener("input", e => void this.onInput(e));
    this.root.addEventListener("change", e => { if ((e.target as HTMLElement).hasAttribute?.("data-upload")) void this.onInput(e); });
    this.root.addEventListener("submit", e => void this.onSubmit(e));
  }

  connectedCallback(): void {
    if (this.cfg) return;
    const inline = this.querySelector('script[type="application/json"]');
    if (inline?.textContent) {
      try { this.config = JSON.parse(inline.textContent) as DolphinConfig; }
      catch { this.root.textContent = "DOLPHin: invalid JSON configuration."; }
    }
  }

  get config(): DolphinConfig | undefined { return this.cfg; }
  set config(value: DolphinConfig) {
    try {
      this.cfg = { ...value, ...(value.brand ? { brand: validateBrand(value.brand) } : {}) };
    } catch (err) {
      this.root.textContent = `DOLPHin: ${err instanceof Error ? err.message : String(err)}`;
      return;
    }
    void this.init();
  }

  private get mode(): "proxy" | "direct" { return this.cfg!.mode ?? (this.cfg!.endpoint ? "proxy" : "direct"); }
  private get hostManaged(): boolean { return this.mode === "direct" && !!this.cfg?.secrets; }
  private get model(): string { return this.cfg?.model ?? DEFAULT_MODEL; }

  private async init(): Promise<void> {
    const cfg = this.cfg!;
    const initial = cfg.brand ?? placeholderBrand(cfg);
    const lang = cfg.lang ?? initial.language;
    this.t = MESSAGES[lang];
    this.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
    this.siteUrl = cfg.siteUrl ?? (globalThis.location ? `${location.origin}/` : "");
    this.store = new LocalStore(`dolphin:${initial.id}:`);
    this.renderer = new CanvasPosterRenderer({ ...(cfg.fonts ? { fonts: cfg.fonts } : {}), contactLabel: b => (b.contact.whatsapp ? "WhatsApp" : this.t.contact) });
    this.studio = new DolphinStudio({ brand: initial, brandLocked: !!cfg.brand, renderer: this.renderer, store: this.store });
    await this.studio.load();
    this.applyBrandLook();
    try { Object.assign(this.prefs, JSON.parse((await this.store.get("prefs")) ?? "{}")); } catch { /* defaults */ }
    if (!this.prefs.start || new Date(this.prefs.start) < new Date(new Date().toDateString())) {
      this.prefs.start = toLocalInput(new Date(Date.now() + 86_400_000)).slice(0, 10);
    }

    if (this.mode === "proxy") {
      const http = { endpoint: cfg.endpoint ?? "", ...(cfg.token ? { token: cfg.token } : {}) };
      let publisher = false;
      try {
        const res = await fetch(http.endpoint.replace(/\/+$/, "") + "/v1/health");
        publisher = !!((await res.json()) as { publisher?: boolean }).publisher;
      } catch { /* server unreachable: generation calls will report it */ }
      this.studio.connect({ llm: new HttpLlm(http), ...(publisher ? { publisher: new HttpPublisher(http) } : {}) });
      this.view = "main";
    } else if (this.hostManaged) {
      this.secrets = { ...cfg.secrets };
      this.applySecrets();
      this.view = "main";
    } else {
      this.vault = new Vault(this.store);
      this.view = (await this.vault.exists()) ? "lock" : "setup";
    }
    this.render();
  }

  /** The interface takes the colors of the current brand. */
  private applyBrandLook(): void {
    const b = this.studio!.brand;
    this.style.setProperty("--d-primary", b.colors.primary);
    this.style.setProperty("--d-accent", b.colors.accent);
  }

  private get ready(): boolean { return this.studio!.brandLocked || this.studio!.hasSavedBrand; }

  // ---------------------------------------------------------------- rendering

  private render(): void {
    const t = this.t;
    const head = `<header>${MARK_SVG}<div><h2>DOLPH<b>in</b></h2><p>${esc(t.tagline)}</p></div><span class="badge">${esc(t.beta)}</span>
      ${this.view === "main" && this.mode === "direct" && !this.hostManaged ? `<button class="end" data-act="lock">${esc(t.lock)}</button>` : ""}</header>`;
    let body = "";
    if (this.view === "loading") body = "";
    else if (this.view === "setup" || this.view === "lock") body = this.lockView();
    else {
      const st = this.studio!;
      body = this.connectionsView()
        + siteCard({ t: this.t, brand: st.brand, locked: st.brandLocked, saved: st.hasSavedBrand, draft: this.draft, logoCandidates: this.logoCandidates, siteUrl: this.siteUrl, busy: this.busy, canAnalyze: st.canGenerate })
        + (this.ready ? ideasCard(this.t, st.ideas, this.busy, st.canGenerate, st.canGenerate) + this.generateView() + this.postsView() : "");
    }
    this.root.innerHTML = `<style>${STYLES}${PROFILE_STYLES}</style><div class="wrap">${head}<div class="toast" role="status" hidden></div>${body}</div>`;
    this.drawAll();
  }

  private lockView(): string {
    const t = this.t, setup = this.view === "setup";
    return `<form class="card lock" data-form="${setup ? "setup" : "unlock"}">
      <h3>${esc(setup ? t.setupTitle : t.lockTitle)}</h3><p class="hint">${esc(setup ? t.setupIntro : t.lockIntro)}</p>
      <label><span>${esc(t.passphrase)}</span><input type="password" name="pass" required minlength="8" autocomplete="${setup ? "new-password" : "current-password"}"></label>
      ${setup ? `<label><span>${esc(t.confirm)}</span><input type="password" name="pass2" required minlength="8" autocomplete="new-password"></label>` : ""}
      <p class="err" data-lock-msg role="alert"></p>
      <div class="row"><button class="primary" type="submit">${esc(setup ? t.create : t.unlock)}</button>
      ${setup ? "" : `<button type="button" class="link" data-act="forget" data-confirm>${esc(t.forgot)}</button>`}</div></form>`;
  }

  private connectionsView(): string {
    const t = this.t, studio = this.studio!;
    if (this.mode === "proxy") {
      return `<div class="card"><h3>${esc(t.connections)}</h3><p class="state ok">${esc(t.proxyOk)}</p>
        <p class="state ${studio.canPublish ? "ok" : "missing"}">${esc(studio.canPublish ? t.fbOk : t.fbMissing)}</p></div>`;
    }
    const s = this.secrets ?? {};
    return `<div class="card"><h3>${esc(t.connections)}</h3>
      <p class="state ${s.claudeKey ? "ok" : "missing"}">${esc(s.claudeKey ? t.keyOk : t.keyMissing)}</p>
      <label><span>${esc(t.claudeKey)}</span><em class="help">${esc(t.claudeHelp)}</em><input type="password" data-key="claudeKey" autocomplete="off" placeholder="sk-ant-…"></label>
      <p class="state ${s.metaPageId && s.metaToken ? "ok" : "missing"}">${esc(s.metaPageId && s.metaToken ? t.fbOk : t.fbMissing)}</p>
      <div class="grid"><label><span>${esc(t.pageId)}</span><input data-key="metaPageId" value="${esc(s.metaPageId)}"></label>
      <label><span>${esc(t.pageToken)}</span><input type="password" data-key="metaToken" autocomplete="off"></label></div>
      <div class="row"><button class="primary" data-act="save-keys">${esc(t.save)}</button><button data-act="test">${esc(t.test)}</button></div></div>`;
  }

  private generateView(): string {
    const t = this.t, p = this.prefs;
    const opts = (o: Record<string, string>, v: string) => Object.entries(o).map(([k, l]) => `<option value="${k}"${k === v ? " selected" : ""}>${esc(l)}</option>`).join("");
    return `<div class="card"><h3>${esc(t.create_)}</h3><div class="grid">
      <label><span>${esc(t.subject)}</span><select data-pref="subject">${opts(t.subjects, p.subject)}</select></label>
      <label><span>${esc(t.tone)}</span><select data-pref="tone">${opts(t.tones, p.tone)}</select></label>
      <label><span>${esc(t.count)}</span><input type="number" min="1" max="10" data-pref="count" value="${p.count}"></label>
      <label><span>${esc(t.startDate)}</span><input type="date" data-pref="start" value="${esc(p.start)}"></label>
      <label><span>${esc(t.time)}</span><input type="time" data-pref="time" value="${esc(p.time)}"></label></div>
      <label><span>${esc(t.notes)}</span><textarea rows="2" data-pref="notes" placeholder="${esc(t.notesPh)}">${esc(p.notes)}</textarea></label>
      <p class="hint">${esc(fill(t.costHint, { cost: usd(estimatePerPostUsd(this.model)) }))}</p>
      <div class="row"><button class="accent" data-act="generate"${this.busy || !this.studio!.canGenerate ? " disabled" : ""}>${esc(this.busy ? t.generating : "✦ " + t.generate)}</button></div></div>`;
  }

  private postsView(): string {
    const t = this.t, posts = this.studio!.list();
    const canPublish = this.studio!.canPublish;
    const bulk = posts.length ? `<div class="row" style="margin-bottom:12px">${canPublish ? `<button class="primary" data-act="schedule-all"${this.busy ? " disabled" : ""}>${esc(t.scheduleAll)}</button>` : ""}
      <button class="danger" data-act="clear" data-confirm>${esc(t.clearAll)}</button></div>` : `<p class="empty">${esc(t.empty)}</p>`;
    return `<h3>${esc(t.posts)}${posts.length ? ` (${posts.length})` : ""}</h3>${bulk}${posts.map((p, i) => this.postCard(p, i, canPublish)).join("")}`;
  }

  private postCard(p: Post, i: number, canPublish: boolean): string {
    const t = this.t, editable = p.status === "draft" || p.status === "failed";
    const ro = editable ? "" : " disabled";
    const field = (k: keyof Post, label: string) => `<label><span>${esc(label)}</span><input data-f="${p.id}:${k}" value="${esc(p[k])}"${ro}></label>`;
    const sel = (k: "theme" | "style", label: string, o: Record<string, string>) =>
      `<label><span>${esc(label)}</span><select data-f="${p.id}:${k}"${ro}>${Object.entries(o).map(([v, l]) => `<option value="${v}"${p[k] === v ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
    return `<article class="card"><div class="head"><strong>${i + 1}. ${esc(p.title)}</strong><span class="pill ${p.status}">${esc(t.status[p.status])}</span></div>
      <div class="post"><canvas width="1080" height="1350" data-canvas="${p.id}" role="img" aria-label="${esc(p.title)}"></canvas><div>
      ${p.error ? `<p class="err">${esc(p.errorCode ? t.errors[p.errorCode] : p.error)}</p>` : ""}
      <div class="grid">${field("tag", t.tag)}${sel("theme", t.theme, t.themes)}</div>
      ${field("title", t.title)}${field("subtitle", t.subtitle)}
      <div class="grid"><label><span>${esc(t.points)}</span><textarea rows="4" data-f="${p.id}:points"${ro}>${esc(p.points.join("\n"))}</textarea></label>${sel("style", t.style, t.styles)}</div>
      <label><span>${esc(t.caption)}</span><textarea rows="6" data-f="${p.id}:caption"${ro}>${esc(p.caption)}</textarea></label>
      <label><span>${esc(t.hashtags)}</span><input data-f="${p.id}:hashtags" value="${esc(p.hashtags.map(h => "#" + h).join(" "))}"${ro}></label>
      <label><span>${esc(t.when)}</span><input type="datetime-local" data-f="${p.id}:scheduledAt" value="${esc(toLocalInput(new Date(p.scheduledAt)))}"${ro}></label>
      <div class="row"><button data-act="download" data-id="${p.id}">${esc(t.download)}</button><button data-act="copy" data-id="${p.id}">${esc(t.copy)}</button>
      ${canPublish && editable ? `<button class="primary" data-act="schedule" data-id="${p.id}"${this.busy ? " disabled" : ""}>${esc(t.schedule)}</button>
        <button class="accent" data-act="publish" data-id="${p.id}"${this.busy ? " disabled" : ""}>${esc(t.publishNow)}</button>` : ""}
      <button class="danger" data-act="remove" data-id="${p.id}" data-confirm>${esc(t.remove)}</button></div></div></div></article>`;
  }

  private drawAll(): void {
    this.root.querySelectorAll<HTMLCanvasElement>("canvas[data-canvas]").forEach(c => this.drawOne(c));
  }
  private drawOne(canvas: HTMLCanvasElement): void {
    const post = this.studio?.get(canvas.dataset.canvas ?? "");
    if (post) void this.renderer.draw(canvas, post, this.studio!.brand);
  }

  private toast(text: string, kind: "info" | "error" | "success" = "info"): void {
    const el = this.root.querySelector<HTMLElement>(".toast");
    if (!el) return;
    el.textContent = text; el.className = `toast ${kind}`; el.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { el.hidden = true; }, kind === "error" ? 9000 : 5000);
  }

  private errorText(err: unknown): string {
    return isDolphinError(err) ? this.t.errors[err.code] : this.t.errors.unknown;
  }

  // ---------------------------------------------------------------- events

  private async onSubmit(e: Event): Promise<void> {
    const form = e.target as HTMLFormElement;
    if (!form.dataset.form) return;
    e.preventDefault();
    const msg = form.querySelector<HTMLElement>("[data-lock-msg]")!;
    const pass = (form.elements.namedItem("pass") as HTMLInputElement).value;
    try {
      if (form.dataset.form === "setup") {
        if (pass !== (form.elements.namedItem("pass2") as HTMLInputElement).value) { msg.textContent = this.t.mismatch; return; }
        await this.vault!.seal(pass, {});
        this.unlocked(pass, {});
      } else {
        this.unlocked(pass, await this.vault!.open(pass));
      }
    } catch (err) {
      msg.textContent = this.errorText(err);
    }
  }

  private unlocked(pass: string, secrets: StudioSecrets): void {
    this.passphrase = pass;
    this.secrets = secrets;
    this.applySecrets();
    this.view = "main";
    this.render();
  }

  private applySecrets(): void {
    const factory = DolphinStudioElement.directFactory;
    const adapters = factory && this.secrets ? factory(this.secrets, this.cfg!) : {};
    this.studio!.connect({ llm: adapters.llm, publisher: adapters.publisher });
  }

  private async onInput(e: Event): Promise<void> {
    const el = e.target as HTMLInputElement;
    if (el.hasAttribute("data-site-url")) { this.siteUrl = el.value.trim(); return; }
    if (el.hasAttribute("data-upload")) {
      if (e.type !== "change" || !el.files?.[0] || !this.draft) return;
      try {
        const { logoUrl, colors } = await logoFromFile(el.files[0]);
        this.draft.logoUrl = logoUrl; delete this.draft.logoOnDarkUrl;
        this.draft.colors = { ...this.draft.colors, ...colors };
        this.render();
      } catch { this.toast(this.t.badLogo, "error"); }
      return;
    }
    if (el.dataset.b && this.draft) {
      const keys = el.dataset.b.split(".");
      let o = this.draft as unknown as Record<string, unknown>;
      for (const k of keys.slice(0, -1)) o = (o[k] ??= {}) as Record<string, unknown>;
      const last = keys[keys.length - 1]!;
      if (el.value.trim()) o[last] = el.value; else delete o[last];
      if (keys[0] === "colors") { this.style.setProperty(`--d-${last}`, el.value); }
      return;
    }
    if (el.dataset.pref) {
      const k = el.dataset.pref as keyof Prefs;
      (this.prefs as unknown as Record<string, string | number>)[k] = k === "count" ? Math.min(10, Math.max(1, Number.parseInt(el.value, 10) || 1)) : el.value;
      await this.store!.set("prefs", JSON.stringify(this.prefs));
      return;
    }
    const f = el.dataset.f;
    if (!f) return;
    const [id, key] = f.split(":") as [string, keyof Post];
    const v = el.value;
    const value = key === "points" ? v.split("\n").map(x => x.trim()).filter(Boolean)
      : key === "hashtags" ? v.split(/[\s,]+/).map(x => x.replace(/^#+/, "")).filter(Boolean)
      : key === "scheduledAt" ? (v ? new Date(v).toISOString() : undefined)
      : v;
    if (value === undefined) return;
    await this.studio!.update(id, { [key]: value } as Partial<Post>);
    clearTimeout(this.redraw.get(id));
    this.redraw.set(id, setTimeout(() => {
      const c = this.root.querySelector<HTMLCanvasElement>(`canvas[data-canvas="${CSS.escape(id)}"]`);
      if (c) this.drawOne(c);
    }, 150));
  }

  private async onClick(e: Event): Promise<void> {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-act]");
    if (!b || b.disabled) return;
    if (b.hasAttribute("data-confirm") && !b.dataset.armed) {
      const label = b.textContent ?? "";
      b.dataset.armed = "1"; b.textContent = this.t.confirmQ;
      setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = label; } }, 3000);
      return;
    }
    const id = b.dataset.id ?? "";
    const studio = this.studio!;
    try {
      switch (b.dataset.act) {
        case "lock": this.secrets = null; this.passphrase = ""; studio.connect({ llm: undefined, publisher: undefined }); this.view = "lock"; this.render(); break;
        case "forget": await this.vault!.reset(); this.view = "setup"; this.render(); break;
        case "save-keys": await this.saveKeys(); break;
        case "test": await this.testConnections(); break;
        case "generate": await this.generate(); break;
        case "analyze": await this.analyze(true); break;
        case "suggest": await this.analyze(false); break;
        case "write-idea": await this.writeIdea(Number(b.dataset.i)); break;
        case "edit-profile": this.draft = clone(studio.brand); this.render(); break;
        case "cancel-profile": this.draft = null; this.render(); break;
        case "save-profile": await this.saveProfile(); break;
        case "add-product": this.draft?.products.push({ name: "", status: "available" }); this.render(); break;
        case "del-product": this.draft?.products.splice(Number(b.dataset.i), 1); this.render(); break;
        case "no-logo": if (this.draft) { delete this.draft.logoUrl; delete this.draft.logoOnDarkUrl; } this.render(); break;
        case "pick-logo": await this.pickLogo(Number(b.dataset.i)); break;
        case "download": await this.download(id); break;
        case "copy": await navigator.clipboard.writeText(studio.caption(id)); this.toast(this.t.copied, "success"); break;
        case "remove": await studio.remove(id); this.render(); break;
        case "clear": await studio.clear(); this.render(); break;
        case "schedule": await this.sendPosts([id], true); break;
        case "publish": await this.sendPosts([id], false); break;
        case "schedule-all": await this.sendPosts(studio.list().filter(p => p.status === "draft" || p.status === "failed").map(p => p.id), true); break;
      }
    } catch (err) {
      this.busy = false;
      this.render();
      this.toast(this.errorText(err), "error");
    }
  }

  private async saveKeys(): Promise<void> {
    const read = (k: string) => this.root.querySelector<HTMLInputElement>(`[data-key="${k}"]`)?.value.trim() ?? "";
    const next: StudioSecrets = { ...this.secrets };
    if (read("claudeKey")) next.claudeKey = read("claudeKey");
    if (read("metaToken")) next.metaToken = read("metaToken");
    next.metaPageId = read("metaPageId");
    if (this.hostManaged) await this.cfg!.onSecretsChange?.(next);
    else await this.vault!.seal(this.passphrase, next);
    this.secrets = next;
    this.applySecrets();
    this.render();
    this.toast(this.t.saved, "success");
  }

  private async testConnections(): Promise<void> {
    const studio = this.studio!;
    const parts: string[] = [];
    let ok = true;
    if (this.secrets?.metaPageId && this.secrets.metaToken && DolphinStudioElement.directFactory) {
      const { publisher } = DolphinStudioElement.directFactory(this.secrets, this.cfg!);
      try { const r = await publisher?.verify?.(); parts.push(`Facebook : ${r?.name ?? "OK"}`); }
      catch (err) { ok = false; parts.push(`Facebook : ${this.errorText(err)}`); }
    }
    parts.push(studio.canGenerate ? this.t.keyOk : this.t.keyMissing);
    this.toast(parts.join(" — "), ok ? "success" : "error");
  }

  private async generate(): Promise<void> {
    this.busy = true; this.render();
    const p = this.prefs;
    const { posts, usage, model } = await this.studio!.generate({
      count: p.count,
      subject: SUBJECTS[p.subject] ?? SUBJECTS.mix!,
      tone: TONES[p.tone] ?? TONES.warm!,
      ...(p.notes ? { notes: p.notes } : {}),
      ...(p.start ? { startDate: new Date(p.start + "T00:00") } : {}),
      time: p.time,
    });
    this.busy = false; this.render();
    this.toast(fill(this.t.generated, { n: posts.length, cost: usd(estimateCostUsd(usage, model)) }), "success");
  }

  /** Reads the site, then shows the proposed profile (`withProfile`) or only refreshes the ideas. */
  private async analyze(withProfile: boolean): Promise<void> {
    const studio = this.studio!;
    this.busy = true; this.render();
    let snapshot;
    try {
      const target = new URL(this.siteUrl || location.href, location.href);
      snapshot = target.href.split("#")[0] === location.href.split("#")[0]
        ? snapshotFromDocument(document, location.href) // the widget is on the page to read
        : await discoverSite(target.href);
    } catch {
      this.busy = false; this.render();
      this.toast(this.t.siteUnreachable, "error");
      return;
    }
    const result = await studio.analyze(snapshot);
    if (withProfile && !studio.brandLocked) {
      const p = result.brand;
      const current = studio.brand;
      const contact = { ...p.contact };
      // prefer the number as written on the site ("+225 07 11…") over the raw wa.me link digits
      const digits = (v: string) => v.replace(/\D/g, "");
      const pretty = (n: string) => snapshot.phones.find(ph => digits(ph) === digits(n) && /\s/.test(ph)) ?? n;
      if (!contact.whatsapp && snapshot.whatsapp[0]) contact.whatsapp = snapshot.whatsapp[0];
      if (!contact.phone && snapshot.phones[0]) contact.phone = snapshot.phones[0];
      if (contact.whatsapp) contact.whatsapp = pretty(contact.whatsapp);
      if (contact.phone) contact.phone = pretty(contact.phone);
      if (!contact.website) contact.website = new URL(snapshot.url).origin;
      const draft: BrandProfile = { ...current, name: p.name, language: p.language, products: p.products.map((x): Product => ({ ...x })), contact };
      for (const k of ["fullName", "location", "audience"] as const) { if (p[k]) draft[k] = p[k]; else delete draft[k]; }
      this.logoCandidates = snapshot.logoCandidates;
      const { logoUrl, colors } = await chooseLogo(snapshot.logoCandidates, snapshot.themeColor);
      if (logoUrl) draft.logoUrl = logoUrl; else delete draft.logoUrl;
      delete draft.logoOnDarkUrl;
      draft.colors = colors;
      this.draft = draft;
    }
    this.busy = false; this.render();
    this.toast(fill(withProfile && this.draft ? this.t.analyzed : this.t.ideasReady, { n: result.ideas.length }), "success");
  }

  private async pickLogo(i: number): Promise<void> {
    const url = this.logoCandidates[i];
    if (!url || !this.draft) return;
    const { logoUrl, colors } = await chooseLogo([url]);
    if (!logoUrl) { this.toast(this.t.noLogoFound, "error"); return; }
    this.draft.logoUrl = logoUrl; delete this.draft.logoOnDarkUrl;
    this.draft.colors = colors;
    this.render();
  }

  private async saveProfile(): Promise<void> {
    if (!this.draft) return;
    const draft = { ...this.draft, products: this.draft.products.filter(p => p.name.trim()) };
    await this.studio!.setBrand(draft);
    this.draft = null;
    this.applyBrandLook();
    this.render();
    this.toast(this.t.profileSaved, "success");
  }

  private async writeIdea(i: number): Promise<void> {
    const idea = this.studio!.ideas[i];
    if (!idea) return;
    this.busy = true; this.render();
    const { posts, usage, model } = await this.studio!.generate({
      count: 1,
      subject: `${idea.title}. ${idea.angle}${idea.product ? ` (product: ${idea.product})` : ""}`,
      tone: TONES[this.prefs.tone] ?? TONES.warm!,
      notes: idea.why,
      ...(this.prefs.start ? { startDate: new Date(this.prefs.start + "T00:00") } : {}),
      time: this.prefs.time,
    });
    this.busy = false; this.render();
    this.toast(fill(this.t.generated, { n: posts.length, cost: usd(estimateCostUsd(usage, model)) }), "success");
  }

  private async download(id: string): Promise<void> {
    const blob = await this.studio!.renderImage(id);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `dolphin-${id.slice(0, 8)}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  private async sendPosts(ids: string[], schedule: boolean): Promise<void> {
    this.busy = true; this.render();
    const report = await this.studio!.send(ids, schedule);
    this.busy = false; this.render();
    if (report.failed.length) this.toast(fill(this.t.partly, { ok: report.sent.length, ko: report.failed.length }), "error");
    else this.toast(fill(this.t.sent, { n: report.sent.length }), "success");
  }
}

export function defineDolphinElement(tag = "dolphin-studio"): void {
  if (!customElements.get(tag)) customElements.define(tag, DolphinStudioElement);
}

/** Mounts the studio inside `target` (element or CSS selector) and returns the element. */
export function mount(target: string | Element, config: DolphinConfig): DolphinStudioElement {
  defineDolphinElement();
  const host = typeof target === "string" ? document.querySelector(target) : target;
  if (!host) throw new Error(`DOLPHin: ${String(target)} not found.`);
  const el = document.createElement("dolphin-studio") as DolphinStudioElement;
  host.appendChild(el);
  el.config = config;
  return el;
}
