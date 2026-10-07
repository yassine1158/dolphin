import { describe, expect, it } from "vitest";
import { MemoryStore } from "../src/adapters/storage/index.js";
import { DolphinStudio } from "../src/app/studio.js";
import { DolphinError } from "../src/core/errors.js";
import { FakeLlm, FakePublisher, FakeRenderer, brand, draft } from "./fixtures.js";

const NOW = new Date(2026, 5, 10, 12, 0);
let n = 0;
const make = (over: Partial<ConstructorParameters<typeof DolphinStudio>[0]> = {}) => {
  const store = new MemoryStore();
  const llm = new FakeLlm(3);
  const publisher = new FakePublisher();
  const studio = new DolphinStudio({ brand, renderer: new FakeRenderer(), store, llm, publisher, now: () => NOW, newId: () => `p${++n}`, ...over });
  return { studio, store, llm, publisher };
};

describe("DolphinStudio", () => {
  it("generates posts scheduled one per day from tomorrow, and persists them", async () => {
    const { studio, store } = make();
    const { posts } = await studio.generate({ count: 3, time: "19:00" });
    expect(posts.map(p => new Date(p.scheduledAt).getDate())).toEqual([11, 12, 13]);
    expect(posts.every(p => p.status === "draft")).toBe(true);
    const again = new DolphinStudio({ brand, renderer: new FakeRenderer(), store });
    expect(await again.load()).toHaveLength(3);
  });

  it("never keeps more posts than asked", async () => {
    const { studio, llm } = make();
    (llm as unknown as { generate: unknown }).generate = async () => ({ drafts: [1, 2, 3].map(draft), usage: { inputTokens: 1, outputTokens: 1 }, model: "m" });
    expect((await studio.generate({ count: 1 })).posts).toHaveLength(1);
  });

  it("sends previous titles so the model does not repeat itself", async () => {
    const { studio, llm } = make();
    await studio.generate({ count: 2 });
    await studio.generate({ count: 1 });
    expect(llm.calls[1]![1].avoidTitles).toEqual(["Titre 1", "Titre 2"]);
  });

  it("edits drafts only", async () => {
    const { studio } = make();
    const [p] = (await studio.generate({ count: 1 })).posts;
    await studio.update(p!.id, { title: "Nouveau", id: "hack" } as never);
    expect(studio.get(p!.id)!.title).toBe("Nouveau");
    await studio.send([p!.id], false);
    await expect(studio.update(p!.id, { title: "x" })).rejects.toThrow(DolphinError);
  });

  it("schedules posts and records failures without stopping the batch", async () => {
    const { studio, publisher } = make();
    const { posts } = await studio.generate({ count: 3 });
    publisher.failWith = undefined;
    await studio.update(posts[1]!.id, { scheduledAt: new Date(NOW.getTime() + 60_000).toISOString() }); // too soon
    const report = await studio.sendAllScheduled();
    expect(report.sent).toEqual([posts[0]!.id, posts[2]!.id]);
    expect(report.failed[0]!.error.code).toBe("schedule_window");
    expect(studio.get(posts[1]!.id)).toMatchObject({ status: "failed", errorCode: "schedule_window" });
    expect(studio.get(posts[0]!.id)).toMatchObject({ status: "scheduled", externalId: "fb_1" });
    expect(publisher.sent[0]!.caption).toBe("Texte 1\n\n#acme");
    expect(publisher.sent[0]!.scheduledAt).toBeInstanceOf(Date);
  });

  it("explains what is missing", async () => {
    const { studio } = make({ llm: undefined, publisher: undefined });
    await expect(studio.generate({ count: 1 })).rejects.toMatchObject({ code: "not_configured" });
    await expect(studio.send(["x"], false)).rejects.toMatchObject({ code: "not_configured" });
  });

  it("notifies listeners", async () => {
    const { studio } = make();
    let calls = 0;
    const off = studio.onChange(() => calls++);
    await studio.generate({ count: 1 });
    off();
    await studio.clear();
    expect(calls).toBe(1);
  });

  it("analyzes a site and keeps the ideas", async () => {
    const { studio, llm, store } = make();
    await studio.load();
    const r = await studio.analyze({ url: "https://x.ci", headings: [], text: "", phones: [], whatsapp: [], emails: [], logoCandidates: [], structured: {} });
    expect(r.brand.name).toBe("Le Fournil");
    expect(llm.analyzed[0]![1]).toBeUndefined(); // no saved profile yet: the model proposes one
    expect(studio.ideas[0]!.title).toBe("Le pain du matin");
    await studio.setBrand({ ...brand, name: "Le Fournil", id: "ignored" });
    expect(studio.brand.id).toBe("acme");
    const again = new DolphinStudio({ brand, renderer: new FakeRenderer(), store, llm });
    await again.load();
    expect(again.brand.name).toBe("Le Fournil");
    expect(again.ideas).toHaveLength(1);
    await again.analyze({ url: "https://x.ci", headings: [], text: "", phones: [], whatsapp: [], emails: [], logoCandidates: [], structured: {} });
    expect(llm.analyzed[1]![1]!.name).toBe("Le Fournil"); // saved profile is sent as the truth
  });

  it("never replaces a brand owned by the host", async () => {
    const { studio } = make({ brandLocked: true });
    await expect(studio.setBrand(brand)).rejects.toMatchObject({ code: "invalid_request" });
  });
});

