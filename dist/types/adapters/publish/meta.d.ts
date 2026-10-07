import { DolphinError } from "../../core/errors.js";
import type { EngagementSample } from "../../core/peak.js";
import type { PublishInput, PublisherPort } from "../../ports/index.js";
export interface MetaPageOptions {
    pageId: string;
    /** Page access token with pages_manage_posts. */
    accessToken: string;
    graphVersion?: string;
    fetch?: typeof fetch;
}
interface GraphError {
    code?: number;
    message?: string;
}
/** Publishes a photo post on a Facebook Page through the Graph API (now or scheduled). */
export declare class MetaPagePublisher implements PublisherPort {
    private readonly opts;
    private readonly base;
    constructor(opts: MetaPageOptions);
    publish({ image, caption, scheduledAt }: PublishInput): Promise<{
        id: string;
    }>;
    verify(): Promise<{
        name: string;
    }>;
    /** Last 100 published posts with their reactions, comments and shares (needs pages_read_engagement). */
    history(): Promise<EngagementSample[]>;
    private request;
}
export declare function graphError(e: GraphError, status?: number): DolphinError;
export {};
