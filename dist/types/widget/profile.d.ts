/** Markup of the "Your website" and "Post ideas" cards. Pure functions: state in, HTML out. */
import type { BrandProfile, PostIdea } from "../core/types.js";
import type { Messages } from "./i18n.js";
export declare const esc: (s: unknown) => string;
export interface SiteCardState {
    t: Messages;
    brand: BrandProfile;
    locked: boolean;
    saved: boolean;
    draft: BrandProfile | null;
    logoCandidates: string[];
    siteUrl: string;
    busy: boolean;
    canAnalyze: boolean;
}
export declare function siteCard(s: SiteCardState): string;
export declare function ideasCard(t: Messages, ideas: readonly PostIdea[], busy: boolean, canAnalyze: boolean, canWrite: boolean): string;
export declare const PROFILE_STYLES = "\n.card h4{margin:16px 0 8px;font-size:.92rem;color:var(--d-primary)}\n.profile-sum{display:flex;gap:14px;align-items:center;margin-bottom:12px}\n.profile-sum p{margin:2px 0 0}\n.logo-thumb{width:56px;height:56px;object-fit:contain;border-radius:10px;background:#fff;border:1px solid var(--d-line);padding:4px}\n.products{display:grid;gap:10px;margin-bottom:10px}\n.product{display:grid;grid-template-columns:minmax(0,1fr) 150px auto;gap:8px;align-items:center;padding:10px;border:1px dashed var(--d-line);border-radius:10px}\n.product .wide{grid-column:1 / -1}\n.logo-row{display:grid;grid-template-columns:160px minmax(0,1fr);gap:14px;align-items:start}\n.logo-preview{height:120px;border-radius:12px;display:grid;place-items:center;padding:10px;background:repeating-conic-gradient(#eef1ef 0 25%,#fff 0 50%) 0 0/16px 16px;border:1px solid var(--d-line)}\n.logo-preview img{max-width:100%;max-height:100px;object-fit:contain}\n.cand{width:56px;height:56px;padding:4px;background:#fff;border:1.5px solid var(--d-line)}\n.cand img{width:100%;height:100%;object-fit:contain}\n.upload{display:inline-flex;margin:0;cursor:pointer}\n.upload input{position:absolute;width:1px;height:1px;opacity:0}\n.upload span{font:600 .9rem var(--d-font);border-radius:10px;padding:9px 14px;background:var(--d-primary);color:#fff}\n.upload input:focus-visible+span{outline:3px solid color-mix(in srgb,var(--d-accent) 55%,transparent)}\n.colors label{margin:0}.colors input[type=color]{width:72px;height:40px;padding:3px}\n.ideas{list-style:none;margin:0 0 12px;padding:0;display:grid;gap:10px}\n.idea{display:flex;gap:12px;justify-content:space-between;align-items:center;border:1px solid var(--d-line);border-radius:12px;padding:12px 14px}\n.idea p{margin:4px 0 0}\n@container (max-width:720px){.product{grid-template-columns:1fr auto}.product select{grid-column:1}.logo-row{grid-template-columns:1fr}.idea{flex-direction:column;align-items:flex-start}}\n";
