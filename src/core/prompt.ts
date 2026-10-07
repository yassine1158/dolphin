import type { BrandProfile, GenerateRequest, Lang } from "./types.js";

const LANGUAGE: Record<Lang, string> = { fr: "French", en: "English", ar: "Modern Standard Arabic" };

const line = (label: string, value?: string): string => (value ? `${label}: ${value}\n` : "");

/**
 * System prompt: who the brand is, what it sells right now, and the rules it never breaks.
 * Written in English for the model; the output language is set explicitly.
 */
export function buildSystemPrompt(brand: BrandProfile): string {
  const rules = brand.rules ?? {};
  const available = brand.products.filter(p => p.status === "available");
  const soon = brand.products.filter(p => p.status === "soon");
  const fmt = (p: BrandProfile["products"][number]) => `- ${p.name}${p.details ? ` — ${p.details}` : ""}`;
  const contact = [brand.contact.whatsapp && `WhatsApp ${brand.contact.whatsapp}`, brand.contact.phone && `phone ${brand.contact.phone}`, brand.contact.website]
    .filter(Boolean).join(", ");

  const hard: string[] = [
    "Only sell what is AVAILABLE. Products coming soon are only announced (\"coming soon\", \"be the first to know\"), never sold.",
    "Never invent facts, figures, promises, awards, discounts or certifications that are not written in this prompt.",
    "Technical advice must be accurate and cautious.",
    "Every post differs from the others: angle, title and theme.",
  ];
  if (rules.hidePrices !== false) hard.push("Never give a price, a minimum quantity, a selling unit or a delivery delay: those are discussed privately with the customer.");
  for (const topic of rules.neverMention ?? []) hard.push(`Never mention: ${topic}.`);
  if (brand.fullName) hard.push(`When the full company name is used, write it exactly: "${brand.fullName}".`);
  for (const x of rules.extra ?? []) hard.push(x);

  return `You are the social media manager of ${brand.name}${brand.fullName ? ` (${brand.fullName})` : ""}.
You write Facebook and Instagram posts in ${LANGUAGE[brand.language]}, in simple and warm wording.
${line("Location", brand.location)}${line("Audience", brand.audience)}${line("Contact for the call to action", contact)}
Available now:
${available.length ? available.map(fmt).join("\n") : "- (nothing is sold yet: only announce)"}
${soon.length ? `\nComing soon:\n${soon.map(fmt).join("\n")}\n` : ""}
Rules you never break:
${hard.map(r => "- " + r).join("\n")}`;
}

export function buildUserPrompt(req: GenerateRequest): string {
  const parts = [`Write ${req.count} post(s). They will be published one per day, in order.`];
  if (req.subject) parts.push(`Subject: ${req.subject}.`);
  if (req.tone) parts.push(`Tone: ${req.tone}.`);
  if (req.notes) parts.push(`Instruction from the manager: ${req.notes}`);
  if (req.avoidTitles?.length) parts.push(`Titles already used, do not repeat them:\n${req.avoidTitles.map(t => "- " + t).join("\n")}`);
  return parts.join("\n");
}
