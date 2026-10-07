import { DolphinError } from "../core/errors.js";
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
    failed: {
        id: string;
        error: DolphinError;
    }[];
}
type Listener = (posts: readonly Post[]) => void;
declare const EDITABLE: readonly (keyof PostDraft | "scheduledAt")[];
/**
 * Application service: every use case of the studio, independent of any UI or vendor.
 */
export declare class DolphinStudio {
    private deps;
    private posts;
    private readonly listeners;
    private readonly key;
    private readonly now;
    private readonly newId;
    private loaded;
    private ideaList;
    private readonly ns;
    constructor(deps: StudioDeps);
    get brand(): BrandProfile;
    get canGenerate(): boolean;
    get canPublish(): boolean;
    /** Swap adapters at runtime (e.g. after the user unlocks their keys). */
    connect(adapters: Pick<StudioDeps, "llm" | "publisher">): void;
    onChange(fn: Listener): () => void;
    get brandLocked(): boolean;
    get ideas(): readonly PostIdea[];
    /** True once the owner saved a profile (or the host provides one). */
    hasSavedBrand: boolean;
    load(): Promise<readonly Post[]>;
    /** Saves the brand profile edited by the owner. */
    setBrand(brand: BrandProfile): Promise<BrandProfile>;
    /** Reads the site through the model: a brand proposal (unless locked) and post ideas. */
    analyze(snapshot: SiteSnapshot): Promise<AnalyzeResult>;
    list(): readonly Post[];
    get(id: string): Post | undefined;
    generate(opts: GenerateOptions): Promise<{
        posts: Post[];
        usage: Usage;
        model: string;
    }>;
    update(id: string, patch: Partial<Pick<Post, (typeof EDITABLE)[number]>>): Promise<Post>;
    remove(id: string): Promise<void>;
    clear(): Promise<void>;
    renderImage(id: string): Promise<Blob>;
    caption(id: string): string;
    /** Publishes now (`schedule: false`) or at each post's `scheduledAt`. */
    send(ids: readonly string[], schedule: boolean): Promise<SendReport>;
    sendAllScheduled(): Promise<SendReport>;
    private require;
    private replace;
    private save;
    private emit;
}
export {};
