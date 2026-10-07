// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Yassine Chaabane. Commercial license: COMMERCIAL-LICENSE.md
//
// Presentation page demo: the real DOLPHin widget and poster renderer, with a scripted model and a
// pretend Facebook page instead of the paid APIs. Nothing leaves the visitor's browser.
(function () {
  "use strict";
  const { DolphinStudioElement, CanvasPosterRenderer, mount } = window.Dolphin;
  const wait = ms => new Promise(r => setTimeout(r, ms));

  // ---------------------------------------------------------------- scripted model
  const DRAFTS = [
    { tag: "Ce matin", title: "Le pain sort du four à 6 h", subtitle: "Au feu de bois, à Cocody", points: ["Baguette tradition", "Croûte croustillante", "Prête dès l'ouverture"], style: "checks", theme: "dark",
      caption: "🥖 6 h du matin : la première fournée sort du four à bois.\nPassez la prendre encore chaude, ou réservez-la sur WhatsApp.\n\n📍 Le Fournil, Cocody", hashtags: ["LeFournil", "Cocody", "PainChaud", "Abidjan"] },
    { tag: "Sur commande", title: "Votre gâteau d'anniversaire", subtitle: "Commandez 48 h avant", points: ["Choisissez la taille", "Ajoutez un message", "Retirez-le le jour J"], style: "steps", theme: "light",
      caption: "🎂 Un anniversaire arrive ?\nCommandez votre gâteau 48 h à l'avance sur WhatsApp : nous le préparons pour le jour J.", hashtags: ["Anniversaire", "Gateau", "LeFournil"] },
    { tag: "Bientôt", title: "La livraison arrive", subtitle: "Soyez prévenu en premier", points: ["Votre pain à domicile", "Inscrivez-vous sur WhatsApp"], style: "checks", theme: "accent",
      caption: "🚚 Bientôt : la livraison à domicile du Fournil.\nÉcrivez « PRÉVENEZ-MOI » sur WhatsApp pour être le premier informé.", hashtags: ["Bientot", "Livraison", "LeFournil"] },
    { tag: "Conseil", title: "Garder son pain frais", subtitle: "", points: ["Dans un sac en tissu", "Jamais au réfrigérateur", "Congelé en tranches"], style: "steps", theme: "light",
      caption: "💡 Comment garder votre pain frais plus longtemps ?\nTrois gestes simples, et votre baguette reste bonne jusqu'au soir.", hashtags: ["Conseil", "Pain", "LeFournil"] },
    { tag: "Coulisses", title: "Pétri à la main, chaque nuit", subtitle: "Le métier avant tout", points: ["Levain maison", "Farine sélectionnée", "Cuisson au bois"], style: "checks", theme: "dark",
      caption: "🌙 Pendant que vous dormez, nous pétrissons.\nLevain maison, farine sélectionnée et cuisson au feu de bois : c'est notre façon de faire.", hashtags: ["Artisan", "Boulangerie", "LeFournil"] },
  ];
  let cursor = 0;

  const demoLlm = {
    async analyze(snapshot, brand) {
      await wait(1400);
      return {
        brand: brand || {
          name: snapshot.structured.name || "Le Fournil",
          location: "Cocody, Abidjan",
          audience: "familles, bureaux et fêtes du quartier",
          language: "fr",
          products: [
            { name: "Pain au feu de bois", status: "available", details: "Cuit chaque matin à 6 h." },
            { name: "Viennoiseries pur beurre", status: "available" },
            { name: "Gâteaux d'anniversaire sur commande", status: "available" },
            { name: "Livraison à domicile", status: "soon" },
          ],
          contact: { callToAction: "Commandez sur WhatsApp" },
        },
        ideas: [
          { title: "La fournée de 6 h", angle: "Montrer le pain qui sort du four à bois", product: "Pain au feu de bois", why: "Donne envie de passer le matin" },
          { title: "Votre gâteau d'anniversaire", angle: "Expliquer la commande 48 h à l'avance", product: "Gâteaux d'anniversaire sur commande", why: "Facilite les commandes de fête" },
          { title: "Garder son pain frais", angle: "Trois gestes simples", why: "Conseil utile, qui crée la confiance" },
          { title: "La livraison arrive bientôt", angle: "Inviter à être prévenu", product: "Livraison à domicile", why: "Prépare le lancement" },
        ],
        usage: { inputTokens: 4000, outputTokens: 1200 },
        model: "démo",
      };
    },
    async generate(brand, request) {
      await wait(1600);
      const drafts = Array.from({ length: request.count }, () => DRAFTS[cursor++ % DRAFTS.length]);
      return { drafts, usage: { inputTokens: 3000, outputTokens: 1500 * request.count }, model: "démo" };
    },
  };
  const demoPublisher = { async publish() { await wait(700); return { id: "demo-" + Date.now() }; }, async verify() { return { name: "Page démo" }; } };
  DolphinStudioElement.directFactory = () => ({ llm: demoLlm, publisher: demoPublisher });

  // ---------------------------------------------------------------- live demo
  const host = document.getElementById("demo-studio");
  const start = document.getElementById("demo-start");
  const run = () => {
    try { Object.keys(localStorage).filter(k => k.startsWith("dolphin:demo-fournil:")).forEach(k => localStorage.removeItem(k)); } catch (e) { /* storage blocked */ }
    host.replaceChildren();
    mount(host, { id: "demo-fournil", mode: "direct", siteUrl: "demo/site.html", secrets: { claudeKey: "demo" }, showConnections: false, lang: "fr" });
    start.textContent = "Recommencer la démo";
  };
  start.addEventListener("click", run);

  // ---------------------------------------------------------------- hero posters, drawn by the real renderer
  const brand = {
    id: "hero", name: "Le Fournil", language: "fr",
    contact: { whatsapp: "+225 07 11 22 33 44", callToAction: "Commandez sur WhatsApp" },
    footerLines: ["Commandez sur WhatsApp", "Retrait ou livraison"],
    products: [], colors: { primary: "#4a2a14", accent: "#f2b705", light: "#fbf6ee" }, logoUrl: "demo/logo.svg",
  };
  const renderer = new CanvasPosterRenderer({ contactLabel: "WhatsApp" });
  document.querySelectorAll("canvas[data-hero]").forEach((canvas, i) => {
    const d = DRAFTS[[0, 1, 2][i]];
    renderer.draw(canvas, { ...d, id: "h" + i, createdAt: "", scheduledAt: "", status: "draft" }, brand);
  });
})();
