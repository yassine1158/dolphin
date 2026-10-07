import { describe, expect, it } from "vitest";
import { MemoryStore } from "../src/adapters/storage/index.js";
import { DolphinStudio } from "../src/app/studio.js";
import { validateBrand, validateGenerateRequest } from "../src/core/brand.js";
import { calendarWeeks, captionWithLink, planToCsv, slug, withUtm } from "../src/core/campaign.js";
import { importEngagementCsv, parseCsv, parseDateTime, toNumber } from "../src/core/csv.js";
import { sanitizeDesign, sanitizePost, sizeOf } from "../src/core/design.js";
import { analyzeInsights, mergeSources } from "../src/core/insights.js";
import { analyzePeaks } from "../src/core/peak.js";
import { buildUserPrompt } from "../src/core/prompt.js";
import type { Post } from "../src/core/types.js";
import { FakeLlm, FakePublisher, FakeRenderer, brand } from "./fixtures.js";

const NOW = new Date(2026, 5, 10, 12, 0);
let n = 0;
const make = () => {
  const store = new MemoryStore();
  const llm = new FakeLlm(3);
  const publisher = new FakePublisher();
  const studio = new DolphinStudio({ brand, renderer: new FakeRenderer(), store, llm, publisher, now: () => NOW, newId: () => `q${++n}` });
  return { studio, store, llm, publisher };
};

describe("CSV import", () => {
  it("parses quoted cells, semicolons and a BOM", () => {
    expect(parseCsv('﻿a;b;c\n"x;1";"say ""hi""";3\r\n\n')).toEqual([["a", "b", "c"], ["x;1", 'say "hi"', "3"]]);
  });
  it("reads numbers and dates as spreadsheets write them", () => {
    expect([toNumber("1 234"), toNumber("1,234"), toNumber("12,5"), toNumber("--"), toNumber("8%")]).toEqual([1234, 1234, 12.5, 0, 8]);
    expect(parseDateTime("03/10/2026 19:05", true)?.getMonth()).toBe(9); // 3 October
    expect(parseDateTime("03/10/2026 19:05", false)?.getMonth()).toBe(2); // March 10
    expect(parseDateTime("10/25/2026 7:30 pm", true)?.getHours()).toBe(19); // 25 cannot be a month
    expect(parseDateTime("2026-06-02 20:15", false)?.getHours()).toBe(20);
    expect(parseDateTime("31/02/2026", true)).toBeNull();
  });
  it("imports a Meta Business Suite post export (English)", () => {
    const csv = "Post ID,Title,Publish time,Reactions,Comments,Shares,Permalink\n" +
      "1,Fresh bread,06/02/2026 19:00,40,5,3,https://www.facebook.com/1\n" +
      "2,Tips,06/03/2026 09:00,4,0,0,javascript:alert(1)\n" +
      "3,,not a date,1,1,1,\n";
    const r = importEngagementCsv(csv);
    expect(r.kind).toBe("posts");
    expect(r.skipped).toBe(1);
    expect(r.columns).toEqual({ time: "Publish time", metrics: ["Reactions", "Comments", "Shares"] });
    expect(r.samples[0]).toMatchObject({ reactions: 40, comments: 5, shares: 3, message: "Fresh bread", url: "https://www.facebook.com/1" });
    expect(new Date(r.samples[0]!.createdTime).getDate()).toBe(2); // month first in English exports
    expect(r.samples[1]!.url).toBeUndefined(); // only https links are kept
  });
  it("imports a French export with day-first dates and a combined engagement column", () => {
    const r = importEngagementCsv("Titre;Heure de publication;Réactions, commentaires et partages\nA;03/06/2026 19:00;55\n");
    expect(new Date(r.samples[0]!.createdTime).getMonth()).toBe(5); // 3 June
    expect(r.samples[0]!.score).toBe(55);
  });
  it("imports an Ads Manager report by hour, with or without a day column", () => {
    const withDay = importEngagementCsv("Day,Time of day (ad account time zone),Results,Impressions\n2026-06-01,19:00:00 - 19:59:59,12,900\n2026-06-01,08:00:00 - 08:59:59,2,300\n");
    expect(withDay.kind).toBe("ads");
    expect(withDay.columns.metrics).toEqual(["Results"]);
    expect(new Date(withDay.samples[0]!.createdTime).getHours()).toBe(19);
    const undated = importEngagementCsv("Campaign name,Time of day (ad account time zone),Link clicks\nX,20:00:00 - 20:59:59,30\n");
    expect(undated.undated).toBe(true);
    expect(undated.samples).toHaveLength(7); // the same hour on every day of the week
  });
  it("refuses a file without the needed columns", () => {
    expect(() => importEngagementCsv("a,b,c\n1,2,3\n")).toThrow(/date/);
    expect(() => importEngagementCsv("Publish time,Foo,Bar\n06/02/2026 19:00,a,b\n")).toThrow(/engagement/);
  });
});

describe("insights", () => {
  const at = (day: number, hour: number, reactions: number, message?: string) => ({
    createdTime: new Date(2026, 5, day, hour).toISOString(), reactions, comments: 0, shares: 0, ...(message ? { message } : {}),
  });
  it("finds the best day and slot, the top posts and the untested days", () => {
    // 1 June 2026 is a Monday
    const samples = [at(1, 19, 50, "Lundi soir"), at(8, 19, 70), at(2, 9, 5), at(9, 9, 7), at(3, 12, 10), at(10, 12, 12)];
    const r = analyzeInsights(samples, new Date(2026, 5, 12));
    expect(r.samples).toBe(6);
    expect(r.bestDay).toBe(0);
    expect(r.bestBlock).toBe(18);
    expect(r.byDay[0]).toEqual({ avg: 60, posts: 2 });
    expect(r.top[0]).toMatchObject({ score: 70 });
    expect(r.untestedDays).toEqual([3, 4, 5, 6]);
    expect(r.confidence).toBe("low");
    expect(r.postsPerWeek).toBeGreaterThan(4);
  });
  it("puts sources with different scales on the same footing", () => {
    const merged = mergeSources([at(1, 19, 10), at(2, 19, 30)], [{ createdTime: at(3, 8, 0).createdTime, reactions: 0, comments: 0, shares: 0, score: 1000 }]);
    expect(merged.map(s => s.score)).toEqual([0.5, 1.5, 1]);
  });
  it("labels the peak report with its source", () => {
    expect(analyzePeaks([at(1, 19, 10)], 1, "import").source).toBe("import");
  });
});

describe("campaigns", () => {
  it("adds UTM parameters and keeps the other ones", () => {
    expect(withUtm("https://shop.example/p?id=4&utm_source=old", { campaign: "Rentrée 2026" }))
      .toBe("https://shop.example/p?id=4&utm_source=facebook&utm_medium=social&utm_campaign=rentree-2026");
    expect(() => withUtm("javascript:alert(1)", {})).toThrow();
    expect(slug("  Été — Promo!! ")).toBe("ete-promo");
  });
  it("prints the tracked link before the hashtags", () => {
    const post = { id: "abcdef1234", caption: "Bonjour", hashtags: ["acme"], link: "https://acme.example/", campaign: "Juin" };
    expect(captionWithLink(post)).toBe("Bonjour\n\n👉 https://acme.example/?utm_source=facebook&utm_medium=social&utm_campaign=juin&utm_content=abcdef12\n\n#acme");
  });
  it("exports the plan as CSV that a spreadsheet cannot run as a formula", () => {
    const post = sanitizePost({ id: "p1", title: "=HYPERLINK(\"http://evil\")", caption: "a, b", hashtags: [], scheduledAt: new Date(2026, 5, 11, 19).toISOString() })!;
    const csv = planToCsv([post]);
    expect(csv.startsWith("﻿date,time,status")).toBe(true);
    expect(csv).toContain("2026-06-11,19:00,draft");
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(csv).toContain('"a, b"');
  });
  it("groups posts by day from Monday", () => {
    const p = sanitizePost({ id: "p", scheduledAt: new Date(2026, 5, 11, 9).toISOString() })!;
    const days = calendarWeeks([p], new Date(2026, 5, 10), 2);
    expect(days).toHaveLength(14);
    expect(days[0]!.date).toBe("2026-06-08");
    expect(days[3]!.posts).toHaveLength(1);
  });
  it("sends the objective, audience and offer to the model, validated", () => {
    const req = validateGenerateRequest({ count: 2, objective: "event", audience: "jeunes éleveurs", offer: "Portes ouvertes samedi" });
    const prompt = buildUserPrompt(req);
    expect(prompt).toContain("Campaign objective: promote the event");
    expect(prompt).toContain("Audience of this campaign: jeunes éleveurs");
    expect(prompt).toContain("Portes ouvertes samedi");
    expect(() => validateGenerateRequest({ count: 1, objective: "spam" })).toThrow(/objective/);
  });
});

describe("design", () => {
  it("keeps valid design fields only", () => {
    expect(sanitizeDesign({ format: "story", layout: "centered", overlay: 3, hideLogo: true, extra: 1 })).toEqual({ format: "story", layout: "centered", overlay: 0.9, hideLogo: true });
    expect(() => sanitizeDesign({ format: "poster" })).toThrow();
    expect(() => sanitizeDesign({ photo: "data:text/html;base64,PHNjcmlwdD4=" })).toThrow();
    expect(sizeOf({ format: "square" })).toEqual({ width: 1080, height: 1080 });
    expect(sizeOf(undefined)).toEqual({ width: 1080, height: 1350 });
  });
  it("repairs posts read from storage", () => {
    expect(sanitizePost({ title: "no id" })).toBeNull();
    const p = sanitizePost({ id: "x", status: "hacked", scheduledAt: "nope", points: ["a", 3], hashtags: ["#ok tag"], link: "javascript:alert(1)", design: { format: "bad" } })!;
    expect(p.status).toBe("draft");
    expect(Number.isNaN(new Date(p.scheduledAt).getTime())).toBe(false);
    expect(p.points).toEqual(["a"]);
    expect(p.hashtags).toEqual(["oktag"]);
    expect(p.link).toBeUndefined();
    expect(p.design).toBeUndefined();
  });
  it("refuses logo URLs with a dangerous scheme", () => {
    expect(() => validateBrand({ ...brand, logoUrl: "javascript:alert(1)" })).toThrow(/http/);
    expect(validateBrand({ ...brand, logoUrl: "/img/logo.png" }).logoUrl).toBe("/img/logo.png");
    expect(validateBrand({ ...brand, logoUrl: "https://cdn.example/logo.png" }).logoUrl).toBe("https://cdn.example/logo.png");
  });
});

describe("studio (v0.4)", () => {
  it("never sends the same post twice, even on a double click", async () => {
    const { studio, publisher } = make();
    const [p] = (await studio.generate({ count: 1 })).posts;
    const [a, b] = await Promise.all([studio.send([p!.id], false), studio.send([p!.id, p!.id], false)]);
    expect(publisher.sent).toHaveLength(1);
    expect(a.sent.length + b.sent.length).toBe(1);
  });
  it("validates edits", async () => {
    const { studio } = make();
    const [p] = (await studio.generate({ count: 1 })).posts;
    await expect(studio.update(p!.id, { scheduledAt: "not a date" })).rejects.toMatchObject({ code: "invalid_request" });
    await expect(studio.update(p!.id, { link: "ftp://x" })).rejects.toMatchObject({ code: "invalid_request" });
    await studio.update(p!.id, { design: { format: "square" } });
    await studio.update(p!.id, { design: { layout: "minimal" } });
    expect(studio.get(p!.id)!.design).toEqual({ format: "square", layout: "minimal" });
    await studio.update(p!.id, { design: null as never });
    expect(studio.get(p!.id)!.design).toBeUndefined();
    await studio.update(p!.id, { points: ["a", 1, "b"] as never, theme: "neon" as never });
    expect(studio.get(p!.id)).toMatchObject({ points: ["a", "b"], theme: "dark" });
  });
  it("stores the campaign, the link and the design on new posts, and keeps them away from the model", async () => {
    const { studio, llm, publisher } = make();
    const { posts } = await studio.generate({ count: 1, objective: "traffic", campaign: "Juin", link: "https://acme.example/", design: { format: "story" } });
    expect(posts[0]).toMatchObject({ campaign: "Juin", link: "https://acme.example/", design: { format: "story" } });
    const sentToModel = llm.calls[0]![1] as unknown as Record<string, unknown>;
    expect(sentToModel.objective).toBe("traffic");
    expect(sentToModel.link).toBeUndefined();
    expect(sentToModel.design).toBeUndefined();
    await studio.send([posts[0]!.id], false);
    expect(publisher.sent[0]!.caption).toContain("utm_campaign=juin");
  });
  it("duplicates a post as a story draft", async () => {
    const { studio } = make();
    const [p] = (await studio.generate({ count: 1 })).posts;
    await studio.send([p!.id], false);
    const copy = await studio.duplicate(p!.id, { format: "story" });
    expect(copy).toMatchObject({ status: "draft", design: { format: "story" }, title: p!.title });
    expect(copy.externalId).toBeUndefined();
    expect(studio.list().map(x => x.id)).toEqual([p!.id, copy.id]);
  });
  it("imports a CSV, merges it with the page and computes insights", async () => {
    const { studio, publisher, store } = make();
    publisher.historyRows = Array.from({ length: 10 }, (_, i) => ({ createdTime: new Date(2026, 4, 4 + i, 19).toISOString(), reactions: 20, comments: 1, shares: 0 }));
    const rows = Array.from({ length: 10 }, (_, i) => `${new Date(2026, 4, 4 + i).toISOString().slice(0, 10)},08:00:00 - 08:59:59,${50 + i}`);
    const r = await studio.importCsv(`Day,Time of day,Results\n${rows.join("\n")}\n`, "ads.csv");
    expect(r.samples).toHaveLength(10);
    expect(studio.peaks?.source).toBe("mixed");
    expect(studio.insights?.samples).toBe(20);
    expect(studio.importedData?.fileName).toBe("ads.csv");
    const again = new DolphinStudio({ brand, renderer: new FakeRenderer(), store });
    await again.load();
    expect(again.importedData?.samples).toHaveLength(10);
    await studio.clearImport();
    expect(studio.peaks?.source).toBe("page");
  });
  it("loads old or broken posts without crashing", async () => {
    const store = new MemoryStore();
    await store.set("posts:acme", JSON.stringify([{ id: "old", title: "Ancien", caption: "x", points: [], hashtags: [], scheduledAt: "2026-06-11T17:00:00.000Z", status: "draft", theme: "dark", style: "checks", tag: "", subtitle: "" }, null, 42, { nope: 1 }]));
    const studio = new DolphinStudio({ brand, renderer: new FakeRenderer(), store });
    const posts = await studio.load();
    expect(posts.map((p: Post) => p.id)).toEqual(["old"]);
  });
});
