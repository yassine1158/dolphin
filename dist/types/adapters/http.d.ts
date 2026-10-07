import type { AnalyzeResult, BrandProfile, GenerateRequest, GenerateResult, SiteSnapshot } from "../core/types.js";
import type { LlmPort, PublishInput, PublisherPort } from "../ports/index.js";
export interface HttpOptions {
    /** Base URL of the server, e.g. https://api.example.com/dolphin */
    endpoint: string;
    /** Optional bearer token, checked by the server. */
    token?: string;
    fetch?: typeof fetch;
}
export declare class HttpLlm implements LlmPort {
    private readonly opts;
    constructor(opts: HttpOptions);
    generate(brand: BrandProfile, request: GenerateRequest): Promise<GenerateResult>;
    analyze(snapshot: SiteSnapshot, brand?: BrandProfile): Promise<AnalyzeResult>;
}
export declare function blobToBase64(blob: Blob): Promise<string>;
export declare class HttpPublisher implements PublisherPort {
    private readonly opts;
    constructor(opts: HttpOptions);
    publish(input: PublishInput): Promise<{
        id: string;
    }>;
    verify(): Promise<{
        name: string;
    }>;
}
