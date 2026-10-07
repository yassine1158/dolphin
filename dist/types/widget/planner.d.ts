import type { CampaignObjective, Lang, Post, PosterFormat, PosterLayout } from "../core/types.js";
import type { Messages } from "./i18n.js";
export interface CampaignPrefs {
    objective: CampaignObjective;
    campaign: string;
    audience: string;
    offer: string;
    link: string;
    format: PosterFormat;
    layout: PosterLayout;
}
export declare const DEFAULT_CAMPAIGN: CampaignPrefs;
/** Campaign block of the "Create with AI" card. Inputs carry data-pref="c.<field>". */
export declare function campaignFields(t: Messages, c: CampaignPrefs): string;
/** Designer controls of one post. Inputs carry data-d="<postId>:<field>". */
export declare function designFields(t: Messages, p: Post, editable: boolean): string;
/** Four weeks from this week, Monday first; each post is a chip that opens the post card. */
export declare function calendarCard(t: Messages, lang: Lang, posts: readonly Post[], now: Date): string;
export declare const PLANNER_STYLES = "\ndetails.campaign,details.designer{border:1px dashed var(--d-line);border-radius:12px;padding:10px 12px;margin:4px 0 12px}\ndetails>summary{cursor:pointer;font-weight:700;color:var(--d-primary);font-size:.92rem}\ndetails[open]>summary{margin-bottom:10px}\n.photo-row{margin-bottom:10px}.photo-row .check{margin:0}\ninput[type=range]{padding:0;accent-color:var(--d-primary)}\n.cal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}\n.cal-h{font-size:.75rem;font-weight:700;color:var(--d-muted);text-align:center}\n.cal-d{min-height:74px;border:1px solid var(--d-line);border-radius:8px;padding:4px;display:flex;flex-direction:column;gap:3px;background:#fff}\n.cal-d.past{background:color-mix(in srgb,var(--d-line) 35%,#fff)}\n.cal-d.today{border-color:var(--d-primary);box-shadow:inset 0 0 0 1px var(--d-primary)}\n.cal-n{font-size:.72rem;color:var(--d-muted)}\n.chip{font:600 .72rem var(--d-font);text-align:start;padding:3px 5px;border-radius:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:color-mix(in srgb,var(--d-accent) 16%,#fff);color:var(--d-ink);border:0}\n.chip.scheduled,.chip.published{background:color-mix(in srgb,var(--d-ok) 18%,#fff)}\n.chip.failed{background:color-mix(in srgb,var(--d-danger) 15%,#fff)}\n.chip b{font-weight:800}\narticle.flash{outline:3px solid var(--d-accent);outline-offset:2px}\n@container (max-width:720px){.cal{grid-template-columns:repeat(7,minmax(0,1fr));gap:2px}.cal-d{min-height:56px;padding:2px}.chip b{display:none}}\n";
