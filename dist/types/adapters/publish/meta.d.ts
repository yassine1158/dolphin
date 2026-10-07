import { DolphinError } from "../../core/errors.js";
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
    private request;
}
export declare function graphError(e: GraphError, status?: number): DolphinError;
export {};
