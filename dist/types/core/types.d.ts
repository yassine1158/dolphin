/**
 * Domain model. Pure data: no DOM, no network, no SDK.
 */
import type { DolphinErrorCode } from "./errors.js";
export type Lang = "fr" | "en" | "ar";
export type ProductStatus = "available" | "soon";
export interface Product {
    name: string;
    status: ProductStatus;
    /** Facts the model may use. Anything not written here must not be claimed. */
    details?: string;
}
export interface BrandContact {
    whatsapp?: string;
    phone?: string;
    website?: string;
    /** Call to action printed on posters, e.g. "Commande sur WhatsApp". */
    callToAction?: string;
}
export interface BrandColors {
    /** Dark brand color, used as poster background in the "dark" theme. */
    primary: string;
    /** Highlight color (tags, markers, footer bar). */
    accent: string;
    /** Light background for the "light" theme. Defaults to a tint of white. */
    light?: string;
}
export interface BrandRules {
    /** Never print prices, minimum quantities or selling units. Default: true. */
    hidePrices?: boolean;
    /** Topics the model must never mention (trade secrets, competitors…). */
    neverMention?: string[];
    /** Any additional instruction, one per entry. */
    extra?: string[];
}
export interface BrandProfile {
    /** Stable identifier, used to namespace local storage. */
    id: string;
    name: string;
    /** Legal or full name, written exactly as given when used. */
    fullName?: string;
    location?: string;
    /** Who the posts speak to, e.g. "poultry farmers in Côte d'Ivoire". */
    audience?: string;
    /** Language of the generated posts. */
    language: Lang;
    contact: BrandContact;
    products: Product[];
    colors: BrandColors;
    /** Logo drawn on light backgrounds. */
    logoUrl?: string;
    /** Logo drawn on dark backgrounds. Falls back to `logoUrl` on a white plate. */
    logoOnDarkUrl?: string;
    /** Two short lines printed on the right of the poster footer. */
    footerLines?: [string, string?];
    rules?: BrandRules;
}
export type PosterTheme = "dark" | "light" | "accent";
export type PointStyle = "checks" | "steps";
/** What the model writes for one post. */
export interface PostDraft {
    tag: string;
    title: string;
    subtitle: string;
    points: string[];
    style: PointStyle;
    theme: PosterTheme;
    caption: string;
    hashtags: string[];
}
export type PostStatus = "draft" | "scheduled" | "published" | "failed";
export interface Post extends PostDraft {
    id: string;
    createdAt: string;
    /** ISO date-time the post is planned for. */
    scheduledAt: string;
    status: PostStatus;
    /** Identifier returned by the network once sent. */
    externalId?: string;
    error?: string;
    errorCode?: DolphinErrorCode;
}
export interface GenerateRequest {
    count: number;
    subject?: string;
    tone?: string;
    notes?: string;
    /** Titles already used, so the model does not repeat itself. */
    avoidTitles?: string[];
}
export interface Usage {
    inputTokens: number;
    outputTokens: number;
}
export interface GenerateResult {
    drafts: PostDraft[];
    usage: Usage;
    model: string;
}
/** What DOLPHin reads from a website page before asking the model to understand it. */
export interface SiteSnapshot {
    url: string;
    lang?: string;
    title?: string;
    description?: string;
    siteName?: string;
    themeColor?: string;
    headings: string[];
    /** Visible text, trimmed to a few thousand characters. */
    text: string;
    phones: string[];
    whatsapp: string[];
    emails: string[];
    /** Absolute URLs, best candidate first. */
    logoCandidates: string[];
    /** Name, address, phone… found in schema.org JSON-LD. */
    structured: Record<string, string>;
}
/** A post the model proposes to write. */
export interface PostIdea {
    title: string;
    angle: string;
    /** Product concerned, if any. */
    product?: string;
    why: string;
}
/** Brand fields the model can infer from a site. Colors and logo come from the page itself. */
export type BrandProposal = Pick<BrandProfile, "name" | "language" | "products"> & Partial<Pick<BrandProfile, "fullName" | "location" | "audience">> & {
    contact: BrandContact;
};
export interface AnalyzeResult {
    brand: BrandProposal;
    ideas: PostIdea[];
    usage: Usage;
    model: string;
}
