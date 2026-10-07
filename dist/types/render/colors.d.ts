/**
 * Brand colors from a logo: a dark color for backgrounds and a vivid accent.
 * `pickBrandColors` is pure (pixel array in, colors out); `colorsFromImage` samples an image in the browser.
 */
import type { BrandColors } from "../core/types.js";
export declare const DEFAULT_COLORS: BrandColors;
export declare function pickBrandColors(pixels: ArrayLike<number>, fallback?: BrandColors): BrandColors;
/** Samples a loaded image (must be same-origin, CORS-enabled or a data URL). */
export declare function colorsFromImage(img: CanvasImageSource, fallback?: BrandColors): BrandColors;
