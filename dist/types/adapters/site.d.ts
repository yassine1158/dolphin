import type { SiteSnapshot } from "../core/types.js";
export declare function snapshotFromDocument(doc: Document, url: string): SiteSnapshot;
/** Fetches a page (same origin, or a site that allows CORS) and reads it. Browser only. */
export declare function discoverSite(url: string, f?: typeof fetch): Promise<SiteSnapshot>;
