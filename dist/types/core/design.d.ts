import type { Post, PosterDesign, PosterFormat, PosterLayout } from "./types.js";
export declare const POSTER_SIZES: Record<PosterFormat, {
    width: number;
    height: number;
}>;
export declare const FORMATS: PosterFormat[];
export declare const LAYOUTS: readonly PosterLayout[];
/** A background photo is a JPEG, PNG or WebP data URL of at most ~1.5 MB. */
export declare const MAX_PHOTO_CHARS = 2000000;
export declare const sizeOf: (design?: PosterDesign) => {
    width: number;
    height: number;
};
/** Keeps only valid design fields; throws on a value that cannot be used. */
export declare function sanitizeDesign(input: unknown): PosterDesign;
/** A link printed in a caption: http(s) only. */
export declare function safeLink(v: unknown): string | undefined;
/**
 * Posts read back from storage can be old, partial or edited by hand: keep what is valid,
 * drop what is not, never throw. Returns null for an entry that is not a post at all.
 */
export declare function sanitizePost(input: unknown): Post | null;
