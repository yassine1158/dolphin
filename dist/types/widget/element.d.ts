import { type StudioSecrets } from "../adapters/secrets/vault.js";
import { type StudioDeps } from "../app/studio.js";
import type { BrandProfile, Lang } from "../core/types.js";
import { type PosterFonts } from "../render/poster.js";
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
export declare class DolphinStudioElement extends HTMLElement {
    /** Set by the full bundle; the lite bundle only supports proxy mode. */
    static directFactory?: DirectFactory;
    private readonly root;
    private cfg?;
    private studio?;
    private renderer;
    private store?;
    private vault?;
    private secrets;
    private passphrase;
    private view;
    private busy;
    private t;
    private prefs;
    private idleTimer;
    private toastTimer;
    private redraw;
    /** Profile being reviewed before it is saved. */
    private draft;
    private logoCandidates;
    private siteUrl;
    constructor();
    disconnectedCallback(): void;
    /** Direct mode with the device vault: lock after 15 minutes without activity. */
    private armIdleLock;
    private lock;
    connectedCallback(): void;
    get config(): DolphinConfig | undefined;
    set config(value: DolphinConfig);
    private get mode();
    private get hostManaged();
    private get model();
    private get uiLang();
    private init;
    /** The interface takes the colors of the current brand. */
    private applyBrandLook;
    private get ready();
    private render;
    private lockView;
    private connectionsView;
    private generateView;
    private postsView;
    private postCard;
    private drawAll;
    private drawOne;
    private toast;
    private errorText;
    private onSubmit;
    private unlocked;
    private applySecrets;
    private onInput;
    private handleInput;
    private scheduleRedraw;
    private onClick;
    private saveKeys;
    private testConnections;
    private generate;
    /** Reads the site, then shows the proposed profile (`withProfile`) or only refreshes the ideas. */
    private analyze;
    private pickLogo;
    private saveProfile;
    private writeIdea;
    /** Campaign and design choices of the "Create" card, as generation options. */
    private campaignOptions;
    private download;
    private save;
    /** Scrolls to a post card and highlights it for a moment. */
    private goto;
    private sendPosts;
}
export declare function defineDolphinElement(tag?: string): void;
/** Mounts the studio inside `target` (element or CSS selector) and returns the element. */
export declare function mount(target: string | Element, config: DolphinConfig): DolphinStudioElement;
