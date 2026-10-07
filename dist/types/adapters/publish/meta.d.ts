import { DolphinError } from "../../core/errors.js";
import type { EngagementSample } from "../../core/peak.js";
import type { PublishInput, PublisherPort } from "../../ports/index.js";
export interface MetaPageOptions {
    pageId: string;
    /** Page access token with pages_manage_posts. */
    accessToken: string;
    graphVersion?: string;
    /**
     * App secret of the Meta app that issued the token (server side only). When set, every call carries
     * appsecret_proof, so a stolen token cannot be used without the secret. Enable "Require App Secret" in the app.
     */
    appSecret?: string;
    fetch?: typeof fetch;
}
/** HMAC-SHA256 of the token with the app secret, hex (Meta's appsecret_proof). */
export declare function appSecretProof(token: string, secret: string): Promise<string>;
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
    /**
     * Published posts with their reactions, comments and shares (needs pages_read_engagement):
     * up to `max` posts (default 300), following Facebook's pages of 100.
     */
    history(max?: number): Promise<EngagementSample[]>;
    /**
     * POST sends the token in the form body; GET puts it in the query, as Facebook's CORS rules
     * require in a browser. URLs with a token are never logged nor put in an error message.
     */
    private request;
}
export declare function graphError(e: GraphError, status?: number): DolphinError;
export {};
