// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Yassine Chaabane. Commercial license: COMMERCIAL-LICENSE.md
import { HttpLlm, HttpPublisher } from "../adapters/http.js";
import { discoverSite, snapshotFromDocument } from "../adapters/site.js";
import { Vault, type StudioSecrets } from "../adapters/secrets/vault.js";
import { IdbStore } from "../adapters/storage/index.js";
import { DolphinStudio, type StudioDeps } from "../app/studio.js";
import { MAX_CSV_BYTES } from "../core/csv.js";
import { safeLink, sizeOf } from "../core/design.js";
import { validateBrand } from "../core/brand.js";
import { DEFAULT_MODEL, estimatePerPostUsd, estimateCostUsd } from "../core/cost.js";
import { isDolphinError } from "../core/errors.js";
import { toLocalInput } from "../core/schedule.js";
import type { BrandProfile, Lang, Post, Product } from "../core/types.js";
import { DEFAULT_COLORS } from "../render/colors.js";
import { CanvasPosterRenderer, type PosterFonts } from "../render/poster.js";
import { MESSAGES, fill, type Messages } from "./i18n.js";
import { INSIGHTS_STYLES, insightsCard } from "./insights.js";
import { chooseLogo, logoFromFile, photoFromFile } from "./logo.js";
import { DEFAULT_CAMPAIGN, PLANNER_STYLES, calendarCard, campaignFields, designFields, type CampaignPrefs } from "./planner.js";
import { PROFILE_STYLES, ideasCard, peakCard, siteCard } from "./profile.js";
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
  /** Show the "Connections" card (keys, Facebook page). Default: true. */
  showConnections?: boolean;
}

export type DirectFactory = (secrets: StudioSecrets, config: DolphinConfig) => Pick<StudioDeps, "llm" | "publisher">;

type View = "loading" | "setup" | "lock" | "main";
type Tab = "create" | "posts" | "calendar" | "audience" | "settings";
const TABS: readonly Tab[] = ["create", "posts", "calendar", "audience", "settings"];
interface Prefs { subject: string; tone: string; count: number; start: string; time: string; notes: string; auto: boolean; c: CampaignPrefs; tab?: Tab }

/** Direct mode: the vault locks itself after this much time without any click or key press. */
const IDLE_LOCK_MS = 15 * 60_000;

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
  private store?: IdbStore;
  private vault?: Vault;
  private secrets: StudioSecrets | null = null;
  private passphrase = "";
  private view: View = "loading";
  private busy = false;
  private t: Messages = MESSAGES.fr;
  private prefs: Prefs = { subject: "mix", tone: "warm", count: 5, start: "", time: "19:00", notes: "", auto: true, c: { ...DEFAULT_CAMPAIGN } };
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
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
    this.root.addEventListener("change", e => {
      const el = e.target as HTMLElement;
      if (el.hasAttribute?.("data-upload") || el.hasAttribute?.("data-photo") || el.hasAttribute?.("data-import")) void this.onInput(e);
    });
    this.root.addEventListener("submit", e => void this.onSubmit(e));
    for (const ev of ["pointerdown", "keydown"]) this.root.addEventListener(ev, () => this.armIdleLock(), { passive: true });
    // arrow keys move between tabs (WAI-ARIA tabs pattern)
    this.root.addEventListener("keydown", e => {
      const k = (e as KeyboardEvent).key, el = e.target as HTMLElement;
      if (!el.matches?.('[role="tab"]') || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(k)) return;
      const tabs = [...this.root.querySelectorAll<HTMLElement>('[role="tab"]')];
      const i = tabs.indexOf(el), rtl = this.getAttribute("dir") === "rtl";
      const next = k === "Home" ? 0 : k === "End" ? tabs.length - 1 : (i + ((k === "ArrowRight") !== rtl ? 1 : -1) + tabs.length) % tabs.length;
      e.preventDefault();
      void this.openTab(tabs[next]!.dataset.tab as Tab).then(() => this.root.querySelector<HTMLElement>(`#dt-${tabs[next]!.dataset.tab}`)?.focus());
    });
  }

  disconnectedCallback(): void { clearTimeout(this.idleTimer); }

  /** Direct mode with the device vault: lock after 15 minutes without activity. */
  private armIdleLock(): void {
    clearTimeout(this.idleTimer);
    if (this.mode !== "direct" || this.hostManaged || this.view !== "main" || !this.cfg) return;
    this.idleTimer = setTimeout(() => {
      if (this.busy) { this.armIdleLock(); return; }
      this.lock();
      this.toast(this.t.autoLocked, "info");
    }, IDLE_LOCK_MS);
  }

  private lock(): void {
    this.secrets = null; this.passphrase = "";
    this.studio!.connect({ llm: undefined, publisher: undefined });
    this.view = "lock"; this.render();
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
  private get uiLang(): Lang { return this.cfg?.lang ?? this.studio?.brand.language ?? "fr"; }

  private async init(): Promise<void> {
    const cfg = this.cfg!;
    const initial = cfg.brand ?? placeholderBrand(cfg);
    const lang = cfg.lang ?? initial.language;
    this.t = MESSAGES[lang];
    this.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
    this.siteUrl = cfg.siteUrl ?? (globalThis.location ? `${location.origin}/` : "");
    this.store = new IdbStore(`dolphin:${initial.id}:`);
    this.renderer = new CanvasPosterRenderer({ ...(cfg.fonts ? { fonts: cfg.fonts } : {}), contactLabel: b => (b.contact.whatsapp ? "WhatsApp" : this.t.contact) });
    this.studio = new DolphinStudio({ brand: initial, brandLocked: !!cfg.brand, renderer: this.renderer, store: this.store });
    await this.studio.load();
    this.applyBrandLook();
    try {
      const saved = JSON.parse((await this.store.get("prefs")) ?? "{}") as Partial<Prefs>;
      Object.assign(this.prefs, saved, { c: { ...DEFAULT_CAMPAIGN, ...(saved.c ?? {}) } });
    } catch { /* defaults */ }
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
      const settings = (this.cfg!.showConnections === false ? "" : this.connectionsView())
        + siteCard({ t: this.t, brand: st.brand, locked: st.brandLocked, saved: st.hasSavedBrand, draft: this.draft, logoCandidates: this.logoCandidates, siteUrl: this.siteUrl, busy: this.busy, canAnalyze: st.canGenerate });
      if (!this.ready) body = settings; // first step: read the site and save the profile
      else {
        const tab = this.currentTab(!!settings);
        const panel = tab === "create" ? ideasCard(this.t, st.ideas, this.busy, st.canGenerate, st.canGenerate) + this.generateView()
          : tab === "posts" ? this.postsView()
          : tab === "calendar" ? calendarCard(this.t, this.uiLang, st.list(), new Date()) || `<p class="empty">${esc(t.empty)}</p>`
          : tab === "audience" ? peakCard(this.t, st.peaks, this.busy) + insightsCard(this.t, this.uiLang, st.insights, st.importedData, this.busy)
          : settings;
        body = this.tabsView(tab, !!settings) + `<section role="tabpanel" id="dp-${tab}" aria-labelledby="dt-${tab}">${panel}</section>`;
      }
    }
    // panels the user opened stay open across re-renders
    const open = new Set([...this.root.querySelectorAll<HTMLDetailsElement>("details[data-k]")].map(d => [d.dataset.k!, d.open] as const).filter(([, o]) => o).map(([k]) => k));
    const closed = new Set([...this.root.querySelectorAll<HTMLDetailsElement>("details[data-k]")].filter(d => !d.open).map(d => d.dataset.k!));
    this.root.innerHTML = `<style>${STYLES}${PROFILE_STYLES}${INSIGHTS_STYLES}${PLANNER_STYLES}</style><div class="wrap">${head}<div class="toast" role="status" hidden></div>${body}</div>`;
    this.root.querySelectorAll<HTMLDetailsElement>("details[data-k]").forEach(d => {
      if (open.has(d.dataset.k!)) d.open = true; else if (closed.has(d.dataset.k!)) d.open = false;
    });
    this.drawAll();
  }

  /** The open tab: the saved one, or the settings while no AI key is connected. */
  private currentTab(hasSettings: boolean): Tab {
    let tab: Tab = TABS.includes(this.prefs.tab as Tab) ? this.prefs.tab! : "create";
    if (!this.studio!.canGenerate && hasSettings && this.mode === "direct" && !this.prefs.tab) tab = "settings";
    if (tab === "settings" && !hasSettings) tab = "create";
    return tab;
  }

  private tabsView(current: Tab, hasSettings: boolean): string {
    const t = this.t, posts = this.studio!.list();
    const todo = posts.filter(p => p.status === "draft" || p.status === "failed").length;
    const upcoming = posts.filter(p => p.status === "scheduled" && new Date(p.scheduledAt) > new Date()).length;
    const needsKeys = this.mode === "direct" && !this.studio!.canGenerate;
    const badge: Partial<Record<Tab, string>> = {
      ...(todo ? { posts: String(todo) } : {}), ...(upcoming ? { calendar: String(upcoming) } : {}), ...(needsKeys ? { settings: "!" } : {}),
    };
    const icons: Record<Tab, string> = { create: "✦", posts: "▦", calendar: "◷", audience: "↗", settings: "⚙" };
    return `<nav class="tabs" role="tablist" aria-label="DOLPHin">${TABS.filter(k => k !== "settings" || hasSettings).map(k =>
      `<button role="tab" class="tab" id="dt-${k}" data-act="tab" data-tab="${k}" aria-selected="${k === current}" aria-controls="dp-${k}" tabindex="${k === current ? 0 : -1}">
        <span aria-hidden="true">${icons[k]}</span> ${esc(t.tabs[k])}${badge[k] ? ` <span class="count${badge[k] === "!" ? " warn" : ""}">${esc(badge[k])}</span>` : ""}</button>`).join("")}</nav>`;
  }

  private async openTab(tab: Tab): Promise<void> {
    this.prefs.tab = tab;
    this.render(); // switch at once, save after
    await this.store!.set("prefs", JSON.stringify(this.prefs)).catch(() => undefined);
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
      <label><span>${esc(t.time)}</span><input type="time" data-pref="time" value="${esc(p.time)}"${p.auto ? " disabled" : ""}></label></div>
      <label class="check"><input type="checkbox" data-pref="auto"${p.auto ? " checked" : ""}><span>⏱ ${esc(t.autoTime)}</span></label>
      <label><span>${esc(t.notes)}</span><textarea rows="2" data-pref="notes" placeholder="${esc(t.notesPh)}">${esc(p.notes)}</textarea></label>
      ${campaignFields(t, p.c)}
      <p class="hint">${esc(fill(t.costHint, { cost: usd(estimatePerPostUsd(this.model)) }))}</p>
      <div class="row"><button class="accent" data-act="generate"${this.busy || !this.studio!.canGenerate ? " disabled" : ""}>${esc(this.busy ? t.generating : "✦ " + t.generate)}</button></div></div>`;
  }

  private postsView(): string {
    const t = this.t, posts = this.studio!.list();
    const canPublish = this.studio!.canPublish;
    const bulk = posts.length ? `<div class="row" style="margin-bottom:12px">${canPublish ? `<button class="primary" data-act="schedule-all"${this.busy ? " disabled" : ""}>${esc(t.scheduleAll)}</button>` : ""}
      <button data-act="export-csv">${esc(t.exportCsv)}</button>
      <button class="danger" data-act="clear" data-confirm>${esc(t.clearAll)}</button></div>` : `<p class="empty">${esc(t.empty)}</p>`;
    return `<h3>${esc(t.posts)}${posts.length ? ` (${posts.length})` : ""}</h3>${bulk}${posts.map((p, i) => this.postCard(p, i, canPublish)).join("")}`;
  }

  private postCard(p: Post, i: number, canPublish: boolean): string {
    const t = this.t, editable = (p.status === "draft" || p.status === "failed") && !this.studio!.isSending(p.id);
    const ro = editable ? "" : " disabled";
    const id = esc(p.id);
    const field = (k: keyof Post, label: string) => `<label><span>${esc(label)}</span><input data-f="${id}:${k}" value="${esc(p[k])}"${ro}></label>`;
    const sel = (k: "theme" | "style", label: string, o: Record<string, string>) =>
      `<label><span>${esc(label)}</span><select data-f="${id}:${k}"${ro}>${Object.entries(o).map(([v, l]) => `<option value="${esc(v)}"${p[k] === v ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
    const { width, height } = sizeOf(p.design);
    return `<article class="card" data-post="${id}"><div class="head"><strong>${i + 1}. ${esc(p.title)}</strong><span class="pill ${esc(p.status)}">${esc(t.status[p.status])}</span></div>
      <div class="post"><canvas width="${width}" height="${height}" data-canvas="${id}" role="img" aria-label="${esc(p.title)}"></canvas><div>
      ${p.error ? `<p class="err">${esc(p.errorCode ? t.errors[p.errorCode] : p.error)}</p>` : ""}
      <div class="grid">${field("tag", t.tag)}${sel("theme", t.theme, t.themes)}</div>
      ${field("title", t.title)}${field("subtitle", t.subtitle)}
      <div class="grid"><label><span>${esc(t.points)}</span><textarea rows="4" data-f="${p.id}:points"${ro}>${esc(p.points.join("\n"))}</textarea></label>${sel("style", t.style, t.styles)}</div>
      <label><span>${esc(t.caption)}</span><textarea rows="6" data-f="${p.id}:caption"${ro}>${esc(p.caption)}</textarea></label>
      <label><span>${esc(t.hashtags)}</span><input data-f="${p.id}:hashtags" value="${esc(p.hashtags.map(h => "#" + h).join(" "))}"${ro}></label>
      <label><span>${esc(t.when)}</span><input type="datetime-local" data-f="${id}:scheduledAt" value="${esc(toLocalInput(new Date(p.scheduledAt)))}"${ro}></label>
      ${designFields(t, p, editable)}
      <div class="row"><button data-act="download" data-id="${id}">${esc(t.download)}</button><button data-act="download-jpg" data-id="${id}">${esc(t.downloadJpg)}</button>
      <button data-act="copy" data-id="${id}">${esc(t.copy)}</button>
      <button data-act="duplicate" data-id="${id}">${esc(t.duplicate)}</button>
      ${(p.design?.format ?? "portrait") !== "story" ? `<button data-act="story" data-id="${id}">${esc(t.makeStory)}</button>` : ""}
      ${canPublish && editable ? `<button class="primary" data-act="schedule" data-id="${id}"${this.busy ? " disabled" : ""}>${esc(t.schedule)}</button>
        <button class="accent" data-act="publish" data-id="${id}"${this.busy ? " disabled" : ""}>${esc(t.publishNow)}</button>` : ""}
      <button class="danger" data-act="remove" data-id="${id}" data-confirm>${esc(t.remove)}</button></div></div></div></article>`;
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
    this.armIdleLock();
  }

  private applySecrets(): void {
    const factory = DolphinStudioElement.directFactory;
    const adapters = factory && this.secrets ? factory(this.secrets, this.cfg!) : {};
    this.studio!.connect({ llm: adapters.llm, publisher: adapters.publisher });
  }

  private async onInput(e: Event): Promise<void> {
    try { await this.handleInput(e); }
    catch (err) { this.toast(this.errorText(err), "error"); }
  }

  private async handleInput(e: Event): Promise<void> {
    const el = e.target as HTMLInputElement;
    if (el.hasAttribute("data-import")) {
      const file = el.files?.[0];
      if (e.type !== "change" || !file) return;
      el.value = "";
      if (file.size > MAX_CSV_BYTES) { this.toast(this.t.importBad, "error"); return; }
      this.busy = true; this.render();
      try {
        const r = await this.studio!.importCsv(await file.text(), file.name);
        this.busy = false; this.render();
        this.toast(fill(this.t.imported, { n: r.samples.length, kind: this.t.importKinds[r.kind] }), "success");
      } catch {
        this.busy = false; this.render();
        this.toast(this.t.importBad, "error");
      }
      return;
    }
    if (el.dataset.photo) {
      const file = el.files?.[0];
      if (e.type !== "change" || !file) return;
      let photo: string;
      try { photo = await photoFromFile(file); } catch { this.toast(this.t.badPhoto, "error"); return; }
      await this.studio!.update(el.dataset.photo, { design: { photo } });
      this.render();
      return;
    }
    if (el.dataset.d) {
      const [id, key] = el.dataset.d.split(":") as [string, string];
      const value = key === "hideLogo" ? el.checked : key === "overlay" ? Number(el.value) : el.value;
      await this.studio!.update(id, { design: { [key]: value } });
      // a new format changes the canvas size: redraw the whole card
      if (key === "format") this.render(); else this.scheduleRedraw(id);
      return;
    }
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
    if (el.dataset.pref?.startsWith("c.")) {
      const k = el.dataset.pref.slice(2) as keyof CampaignPrefs;
      (this.prefs.c as unknown as Record<string, string>)[k] = el.value;
      await this.store!.set("prefs", JSON.stringify(this.prefs));
      return;
    }
    if (el.dataset.pref) {
      const k = el.dataset.pref as keyof Prefs;
      (this.prefs as unknown as Record<string, string | number | boolean>)[k] = k === "auto" ? el.checked
        : k === "count" ? Math.min(10, Math.max(1, Number.parseInt(el.value, 10) || 1)) : el.value;
      await this.store!.set("prefs", JSON.stringify(this.prefs));
      if (k === "auto") { const time = this.root.querySelector<HTMLInputElement>('[data-pref="time"]'); if (time) time.disabled = el.checked; }
      return;
    }
    const f = el.dataset.f;
    if (!f) return;
    const [id, key] = f.split(":") as [string, keyof Post];
    const v = el.value;
    if (key === "link" && v.trim() && !safeLink(v)) { el.setCustomValidity(this.t.badLink); el.reportValidity(); return; }
    el.setCustomValidity?.("");
    const scheduled = key === "scheduledAt" ? new Date(v) : null;
    if (scheduled && Number.isNaN(scheduled.getTime())) return; // still being typed
    const value = key === "points" ? v.split("\n").map(x => x.trim()).filter(Boolean)
      : key === "hashtags" ? v.split(/[\s,]+/).map(x => x.replace(/^#+/, "")).filter(Boolean)
      : scheduled ? scheduled.toISOString()
      : v;
    await this.studio!.update(id, { [key]: value } as Partial<Post>);
    this.scheduleRedraw(id);
  }

  private scheduleRedraw(id: string): void {
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
        case "lock": clearTimeout(this.idleTimer); this.lock(); break;
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
        case "peaks": {
          this.busy = true; this.render();
          await studio.peakTimes();
          this.busy = false; this.render();
          this.toast(this.t.peakReady, "success");
          break;
        }
        case "download": await this.download(id); break;
        case "download-jpg": await this.download(id, "image/jpeg"); break;
        case "duplicate": await studio.duplicate(id); this.render(); this.toast(this.t.duplicated, "success"); break;
        case "story": { const copy = await studio.duplicate(id, { format: "story" }); this.render(); this.goto(copy.id); this.toast(this.t.duplicated, "success"); break; }
        case "no-photo": await studio.update(id, { design: { photo: "" } }); this.render(); break;
        case "goto": this.goto(id); break;
        case "tab": await this.openTab(b.dataset.tab as Tab); break;
        case "export-csv": this.save(new Blob([studio.exportCsv()], { type: "text/csv;charset=utf-8" }), `dolphin-plan-${new Date().toISOString().slice(0, 10)}.csv`); break;
        case "clear-import": { this.busy = true; this.render(); await studio.clearImport(); this.busy = false; this.render(); break; }
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
    const p = this.prefs;
    if (p.c.link.trim() && !safeLink(p.c.link)) { this.toast(this.t.badLink, "error"); return; }
    this.busy = true; this.render();
    const { posts, usage, model } = await this.studio!.generate({
      count: p.count,
      subject: SUBJECTS[p.subject] ?? SUBJECTS.mix!,
      tone: TONES[p.tone] ?? TONES.warm!,
      ...(p.notes ? { notes: p.notes } : {}),
      ...(p.start ? { startDate: new Date(p.start + "T00:00") } : {}),
      time: p.auto ? "auto" : p.time,
      ...this.campaignOptions(),
    });
    this.busy = false; this.prefs.tab = "posts"; this.render();
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
    const saved = await this.studio!.setBrand(draft);
    this.draft = null;
    this.applyBrandLook();
    if (!this.cfg!.lang) { // the interface follows the language of the saved profile
      this.t = MESSAGES[saved.language];
      this.setAttribute("dir", saved.language === "ar" ? "rtl" : "ltr");
    }
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
      time: this.prefs.auto ? "auto" : this.prefs.time,
      ...this.campaignOptions(),
    });
    this.busy = false; this.prefs.tab = "posts"; this.render();
    this.toast(fill(this.t.generated, { n: posts.length, cost: usd(estimateCostUsd(usage, model)) }), "success");
  }

  /** Campaign and design choices of the "Create" card, as generation options. */
  private campaignOptions() {
    const c = this.prefs.c;
    const link = safeLink(c.link);
    return {
      objective: c.objective,
      ...(c.audience.trim() ? { audience: c.audience.trim().slice(0, 200) } : {}),
      ...(c.offer.trim() ? { offer: c.offer.trim().slice(0, 500) } : {}),
      ...(c.campaign.trim() ? { campaign: c.campaign.trim() } : {}),
      ...(link ? { link } : {}),
      design: { ...(c.format !== "portrait" ? { format: c.format } : {}), ...(c.layout !== "classic" ? { layout: c.layout } : {}) },
    };
  }

  private async download(id: string, type: "image/png" | "image/jpeg" = "image/png"): Promise<void> {
    const post = this.studio!.get(id);
    if (!post) return;
    const blob = await this.renderer.export(post, this.studio!.brand, type);
    this.save(blob, `dolphin-${id.slice(0, 8)}-${post.design?.format ?? "portrait"}.${type === "image/png" ? "png" : "jpg"}`);
  }

  private save(blob: Blob, name: string): void {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /** Scrolls to a post card and highlights it for a moment. */
  private goto(id: string): void {
    if (this.prefs.tab !== "posts") { this.prefs.tab = "posts"; void this.store!.set("prefs", JSON.stringify(this.prefs)); this.render(); }
    const card = this.root.querySelector<HTMLElement>(`article[data-post="${CSS.escape(id)}"]`);
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "start" });
    card.classList.add("flash");
    setTimeout(() => card.classList.remove("flash"), 1600);
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
