import type { BrandProfile, Post } from "../core/types.js";
import type { PosterRenderer } from "../ports/index.js";
export declare const POSTER_WIDTH = 1080;
export declare const POSTER_HEIGHT = 1350;
export interface PosterFonts {
    display: string;
    body: string;
}
export declare const DEFAULT_FONTS: PosterFonts;
export interface PosterAssets {
    logo?: CanvasImageSource | null;
    /** Background photo chosen by the designer (post.design.photo, already loaded). */
    photo?: CanvasImageSource | null;
    /** Draw the logo on a white plate (a dark logo on a dark background). */
    logoPlate?: boolean;
    fonts?: PosterFonts;
    /** Small label above the contact number. */
    contactLabel?: string;
}
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export declare function wrapText(ctx: Pick<Ctx, "measureText">, text: string, maxWidth: number): string[];
/**
 * Draws a poster: 1080×1350 by default, 1080×1080 or 1080×1920 with `post.design.format`.
 * Content shrinks until it fits above the footer bar. Arabic posters are mirrored (right-to-left).
 */
export declare function drawPoster(ctx: Ctx, post: Post, brand: BrandProfile, assets?: PosterAssets): void;
/** Browser renderer: loads the logo once, waits for fonts, returns a PNG. */
export declare class CanvasPosterRenderer implements PosterRenderer {
    private readonly options;
    private readonly images;
    constructor(options?: {
        fonts?: PosterFonts;
        contactLabel?: string | ((brand: BrandProfile) => string | undefined);
    });
    private loadImage;
    logoFor(post: Post, brand: BrandProfile): Promise<HTMLImageElement | null>;
    draw(canvas: HTMLCanvasElement, post: Post, brand: BrandProfile): Promise<void>;
    render(post: Post, brand: BrandProfile): Promise<Blob>;
    /** PNG (lossless, for Facebook) or JPEG (smaller, for messaging apps and print shops). */
    export(post: Post, brand: BrandProfile, type?: "image/png" | "image/jpeg"): Promise<Blob>;
}
export {};
