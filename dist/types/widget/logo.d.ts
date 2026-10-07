/** Logo helpers for the browser: load, keep as a data URL, read the brand colors. */
import type { BrandColors } from "../core/types.js";
export declare function loadImage(src: string): Promise<HTMLImageElement>;
/**
 * Re-encodes an image as a PNG data URL (at most 512 px). The poster canvas can then always be
 * exported, the logo travels with the brand profile, and the original site is not hit again.
 * Throws when the image is cross-origin without CORS (the canvas would be tainted).
 */
export declare function toDataUrl(img: HTMLImageElement): string;
/** First usable logo among the candidates (big enough, readable), with its colors. */
export declare function chooseLogo(candidates: string[], themeColor?: string): Promise<{
    logoUrl?: string;
    colors: BrandColors;
}>;
/** A logo chosen by the user from their device. */
export declare function logoFromFile(file: File): Promise<{
    logoUrl: string;
    colors: BrandColors;
}>;
