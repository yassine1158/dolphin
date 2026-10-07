import type { BrandColors, PosterTheme } from "../core/types.js";
export interface Palette {
    bg: string;
    fg: string;
    accent: string;
    glow: [string, string];
    tagBg: string;
    tagFg: string;
    tagLine: string;
    markBg: string;
    markFg: string;
    bar: string;
    barFg: string;
    /** Which logo variant the background needs. */
    logo: "onDark" | "onLight" | "plate";
}
export declare const rgba: (hex: string, a: number) => string;
/** Relative luminance (WCAG). */
export declare function luminance(hex: string): number;
export declare function contrast(a: string, b: string): number;
/** White or the dark color, whichever reads better on `bg`. */
export declare const readableOn: (bg: string, dark: string) => string;
export declare function paletteFor(colors: BrandColors, theme: PosterTheme): Palette;
