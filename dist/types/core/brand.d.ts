import type { BrandProfile, GenerateRequest, SiteSnapshot } from "./types.js";
/** Validates a brand profile coming from configuration or from the network. */
export declare function validateBrand(input: unknown): BrandProfile;
export declare function validateGenerateRequest(input: unknown): GenerateRequest;
/** Validates a page snapshot sent by a browser before it reaches the model. */
export declare function validateSnapshot(input: unknown): SiteSnapshot;
