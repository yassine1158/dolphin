import type { PointStyle, PostDraft, PosterTheme } from "./types.js";
export declare const MAX_POSTS = 10;
export declare const MAX_POINTS = 5;
/** JSON Schema given to the model as structured output format. */
export declare const POSTS_JSON_SCHEMA: {
    readonly type: "object";
    readonly additionalProperties: false;
    readonly required: readonly ["posts"];
    readonly properties: {
        readonly posts: {
            readonly type: "array";
            readonly items: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["tag", "title", "subtitle", "points", "style", "theme", "caption", "hashtags"];
                readonly properties: {
                    readonly tag: {
                        readonly type: "string";
                        readonly description: "Short label on top of the poster, 1 to 3 words.";
                    };
                    readonly title: {
                        readonly type: "string";
                        readonly description: "Poster headline, 45 characters at most.";
                    };
                    readonly subtitle: {
                        readonly type: "string";
                        readonly description: "Short line under the title, 60 characters at most. Empty string if not useful.";
                    };
                    readonly points: {
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                        readonly description: "2 to 4 short points for the poster, 38 characters at most each.";
                    };
                    readonly style: {
                        readonly type: "string";
                        readonly enum: readonly PointStyle[];
                        readonly description: "steps for ordered advice or steps, checks otherwise.";
                    };
                    readonly theme: {
                        readonly type: "string";
                        readonly enum: readonly PosterTheme[];
                        readonly description: "Poster colors; alternate from one post to the next.";
                    };
                    readonly caption: {
                        readonly type: "string";
                        readonly description: "Post text: 3 to 7 short lines, a few emojis, ends with the call to action and the contact.";
                    };
                    readonly hashtags: {
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                        readonly description: "3 to 6 hashtags without the # sign.";
                    };
                };
            };
        };
    };
};
/** Normalizes one hashtag: no #, no spaces. */
export declare const cleanHashtag: (h: string) => string;
/**
 * Validates and normalizes the model output. The schema is enforced by the API,
 * but the client never trusts it blindly: anything unusable raises `invalid_output`.
 */
export declare function parseDrafts(value: unknown): PostDraft[];
/** Caption as published: text, blank line, hashtags. */
export declare const fullCaption: (p: Pick<PostDraft, "caption" | "hashtags">) => string;
