import type { BrandProfile, BrandProposal, Lang, PostIdea, SiteSnapshot } from "./types.js";
export declare const MAX_IDEAS = 10;
/** Structured output for the analysis. Every field is required; unknown values are empty strings. */
export declare const ANALYSIS_JSON_SCHEMA: {
    readonly type: "object";
    readonly additionalProperties: false;
    readonly required: readonly ["brand", "ideas"];
    readonly properties: {
        readonly brand: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly required: readonly ["name", "fullName", "location", "audience", "language", "products", "contact"];
            readonly properties: {
                readonly name: {
                    readonly type: "string";
                    readonly description: "Short brand name.";
                };
                readonly fullName: {
                    readonly type: "string";
                    readonly description: "Legal or full name if written on the site, else empty.";
                };
                readonly location: {
                    readonly type: "string";
                    readonly description: "City and country if stated, else empty.";
                };
                readonly audience: {
                    readonly type: "string";
                    readonly description: "Who the business sells to, in a few words.";
                };
                readonly language: {
                    readonly type: "string";
                    readonly enum: readonly Lang[];
                    readonly description: "Main language of the site.";
                };
                readonly products: {
                    readonly type: "array";
                    readonly items: {
                        readonly type: "object";
                        readonly additionalProperties: false;
                        readonly required: readonly ["name", "status", "details"];
                        readonly properties: {
                            readonly name: {
                                readonly type: "string";
                            };
                            readonly status: {
                                readonly type: "string";
                                readonly enum: readonly ["available", "soon"];
                                readonly description: "soon only if the site says it is coming.";
                            };
                            readonly details: {
                                readonly type: "string";
                                readonly description: "Facts stated on the site only, no prices. Empty if none.";
                            };
                        };
                    };
                };
                readonly contact: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly required: readonly ["whatsapp", "phone", "website", "callToAction"];
                    readonly properties: {
                        readonly whatsapp: {
                            readonly type: "string";
                        };
                        readonly phone: {
                            readonly type: "string";
                        };
                        readonly website: {
                            readonly type: "string";
                        };
                        readonly callToAction: {
                            readonly type: "string";
                            readonly description: "Short call to action for posters, e.g. \"Order on WhatsApp\".";
                        };
                    };
                };
            };
        };
        readonly ideas: {
            readonly type: "array";
            readonly items: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["title", "angle", "product", "why"];
                readonly properties: {
                    readonly title: {
                        readonly type: "string";
                        readonly description: "Working title of the post, 60 characters at most.";
                    };
                    readonly angle: {
                        readonly type: "string";
                        readonly description: "What the post says and how, one sentence.";
                    };
                    readonly product: {
                        readonly type: "string";
                        readonly description: "Product concerned, or empty.";
                    };
                    readonly why: {
                        readonly type: "string";
                        readonly description: "Why this post helps the business now, one short sentence.";
                    };
                };
            };
        };
    };
};
export declare function parseAnalysis(value: unknown): {
    brand: BrandProposal;
    ideas: PostIdea[];
};
/**
 * The page content is untrusted data written by whoever controls the site.
 * It goes in its own block and the model is told to ignore any instruction inside it.
 */
export declare function buildAnalyzePrompt(snapshot: SiteSnapshot, brand?: BrandProfile): {
    system: string;
    user: string;
};
