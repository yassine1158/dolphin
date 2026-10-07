import { type StudioSecrets } from "../adapters/secrets/vault.js";
import { type StudioDeps } from "../app/studio.js";
import type { BrandProfile, Lang } from "../core/types.js";
import { type PosterFonts } from "../render/poster.js";
export interface DolphinConfig {
    brand: BrandProfile;
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
    private toastTimer;
    private redraw;
    constructor();
    connectedCallback(): void;
    get config(): DolphinConfig | undefined;
    set config(value: DolphinConfig);
    private get mode();
    private get hostManaged();
    private get model();
    private init;
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
    private onClick;
    private saveKeys;
    private testConnections;
    private generate;
    private download;
    private sendPosts;
}
export declare function defineDolphinElement(tag?: string): void;
/** Mounts the studio inside `target` (element or CSS selector) and returns the element. */
export declare function mount(target: string | Element, config: DolphinConfig): DolphinStudioElement;
