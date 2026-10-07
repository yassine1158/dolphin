import type { BrandProfile, GenerateRequest } from "./types.js";
/** Validates a brand profile coming from configuration or from the network. */
export declare function validateBrand(input: unknown): BrandProfile;
export declare function validateGenerateRequest(input: unknown): GenerateRequest;
