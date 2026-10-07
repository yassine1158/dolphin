import { describe, expect, it } from "vitest";
import { validateBrand, validateGenerateRequest } from "../src/core/brand.js";
import { estimateCostUsd } from "../src/core/cost.js";
import { DolphinError } from "../src/core/errors.js";
import { buildSystemPrompt, buildUserPrompt } from "../src/core/prompt.js";
import { assertSchedulable, planSchedule } from "../src/core/schedule.js";
import { fullCaption, parseDrafts } from "../src/core/schema.js";
import { brand } from "./fixtures.js";

describe("parseDrafts", () => {
  it("normalizes the model output", () => {
    const [d] = parseDrafts({ posts: [{ tag: " Promo ", title: "T", subtitle: 3, points: ["a", "", "b"], style: "weird", theme: "neon", caption: "C", hashtags: ["#un", "deux trois"] }] });
    expect(d).toEqual({ tag: "Promo", title: "T", subtitle: "", points: ["a", "b"], style: "checks", theme: "dark", caption: "C", hashtags: ["un", "deuxtrois"] });
  });
  it("drops posts without title or caption and rejects empty answers", () => {
    expect(() => parseDrafts({ posts: [{ title: "", caption: "x" }] })).toThrow(DolphinError);
    expect(() => parseDrafts({ nope: 1 })).toThrowError(/no posts/);
  });
  it("caps the number of posts", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ title: `t${i}`, caption: "c" }));
    expect(parseDrafts({ posts: many })).toHaveLength(10);
  });
});

describe("prompts", () => {
  const sys = buildSystemPrompt(brand);
  it("separates available and upcoming products", () => {
    expect(sys).toMatch(/Available now:\n- Œufs à couver — Œufs fécondés/);
    expect(sys).toMatch(/Coming soon:\n- Aliments/);
  });
  it("applies the brand rules", () => {
    expect(sys).toContain("Never give a price");
    expect(sys).toContain("Never mention: les formules des aliments.");
    expect(sys).toContain('write it exactly: "ACME Nutrition Animale"');
    expect(sys).toContain("in French");
  });
  it("can allow prices", () => {
    expect(buildSystemPrompt({ ...brand, rules: { hidePrices: false } })).not.toContain("Never give a price");
  });
  it("passes the request and avoids repeated titles", () => {
    const u = buildUserPrompt({ count: 3, subject: "tips", avoidTitles: ["Old"] });
    expect(u).toContain("Write 3 post(s)");
    expect(u).toContain("- Old");
  });
});

describe("schedule", () => {
  it("plans one slot per day at the given time", () => {
    const d = planSchedule(3, new Date(2026, 0, 30), "08:30");
    expect(d.map(x => [x.getMonth(), x.getDate(), x.getHours(), x.getMinutes()])).toEqual([[0, 30, 8, 30], [0, 31, 8, 30], [1, 1, 8, 30]]);
  });
  it("enforces the Meta window", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    expect(() => assertSchedulable(new Date("2026-01-01T00:05:00Z"), now)).toThrowError(/10 minutes/);
    expect(() => assertSchedulable(new Date("2026-02-15T00:00:00Z"), now)).toThrow();
    expect(() => assertSchedulable(new Date("2026-01-02T00:00:00Z"), now)).not.toThrow();
  });
});

describe("validation", () => {
  it("accepts a valid brand and keeps optional fields", () => {
    const b = validateBrand(brand);
    expect(b.fullName).toBe("ACME Nutrition Animale");
    expect(b.rules?.neverMention).toEqual(["les formules des aliments"]);
  });
  it("rejects bad input with clear messages", () => {
    expect(() => validateBrand({ ...brand, colors: { primary: "green", accent: "#fff" } })).toThrowError(/hex color/);
    expect(() => validateBrand({ ...brand, language: "de" })).toThrowError(/language/);
    expect(() => validateBrand({ ...brand, products: [{ name: "x", status: "maybe" }] })).toThrowError(/status/);
    expect(() => validateGenerateRequest({ count: 11 })).toThrowError(/1 to 10/);
    expect(validateGenerateRequest({ count: 2, notes: "hi" })).toEqual({ count: 2, notes: "hi" });
  });
});

it("estimates cost and formats captions", () => {
  expect(estimateCostUsd({ inputTokens: 1_000_000, outputTokens: 1_000_000 }, "claude-opus-5-5")).toBe(24);
  expect(fullCaption({ caption: " Bonjour ", hashtags: ["un", "#deux"] })).toBe("Bonjour\n\n#un #deux");
});
