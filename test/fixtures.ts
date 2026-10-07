import type { AnalyzeResult, BrandProfile, GenerateResult, PostDraft, SiteSnapshot } from "../src/core/types.js";
import type { LlmPort, PosterRenderer, PublishInput, PublisherPort } from "../src/ports/index.js";

export const brand: BrandProfile = {
  id: "acme",
  name: "ACME",
  fullName: "ACME Nutrition Animale",
  location: "Abidjan, Côte d'Ivoire",
  audience: "éleveurs de volailles",
  language: "fr",
  contact: { whatsapp: "+225 07 00 00 00 00", callToAction: "Commande sur WhatsApp" },
  products: [
    { name: "Œufs à couver", status: "available", details: "Œufs fécondés pour incubateur." },
    { name: "Aliments", status: "soon" },
  ],
  colors: { primary: "#0b3f2f", accent: "#f3811d" },
  rules: { neverMention: ["les formules des aliments"] },
};

export const draft = (i: number): PostDraft => ({
  tag: "Conseil", title: `Titre ${i}`, subtitle: "", points: ["Un", "Deux"], style: "checks", theme: "dark",
  caption: `Texte ${i}`, hashtags: ["acme"],
});

export class FakeLlm implements LlmPort {
  calls: Parameters<LlmPort["generate"]>[] = [];
  constructor(private readonly n = 3) {}
  async generate(...args: Parameters<LlmPort["generate"]>): Promise<GenerateResult> {
    this.calls.push(args);
    return { drafts: Array.from({ length: Math.min(this.n, args[1].count) }, (_, i) => draft(i + 1)), usage: { inputTokens: 1000, outputTokens: 500 }, model: "claude-opus-5-5" };
  }
  analyzed: [SiteSnapshot, BrandProfile | undefined][] = [];
  async analyze(snapshot: SiteSnapshot, b?: BrandProfile): Promise<AnalyzeResult> {
    this.analyzed.push([snapshot, b]);
    return {
      brand: { name: "Le Fournil", language: "fr", products: [{ name: "Pain", status: "available" }], contact: { phone: "+225 01" } },
      ideas: [{ title: "Le pain du matin", angle: "Montrer la fournée", why: "Attire les clients du matin" }],
      usage: { inputTokens: 2000, outputTokens: 800 }, model: "claude-opus-5-5",
    };
  }
}

export class FakeRenderer implements PosterRenderer {
  async render() { return new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])], { type: "image/png" }); }
}

export class FakePublisher implements PublisherPort {
  sent: PublishInput[] = [];
  failWith?: Error;
  async publish(input: PublishInput) {
    if (this.failWith) throw this.failWith;
    this.sent.push(input);
    return { id: `fb_${this.sent.length}` };
  }
  async verify() { return { name: "Page ACME" }; }
  historyRows: { createdTime: string; reactions: number; comments: number; shares: number }[] = [];
  async history() { return this.historyRows; }
}
