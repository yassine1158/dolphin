// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Yassine Chaabane. Commercial license: COMMERCIAL-LICENSE.md
//
// Presentation page demo: the real DOLPHin widget and poster renderer, with a scripted model and a
// pretend Facebook page instead of the paid APIs. Nothing leaves the visitor's browser.
(function () {
  "use strict";
  const { DolphinStudioElement, CanvasPosterRenderer, mount, analyzePeaks } = window.Dolphin;
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
  // a pretend page history: the bakery's audience reacts most on weekday evenings and Saturday mornings
  const history = () => {
    const rows = [], now = new Date();
    for (let i = 1; i <= 60; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, [7, 12, 19, 20, 10][i % 5], 0);
      const day = (d.getDay() + 6) % 7, h = d.getHours();
      const peak = (day < 5 && (h === 19 || h === 20)) || (day === 5 && h === 10);
      rows.push({ createdTime: d.toISOString(), reactions: peak ? 60 + (i % 7) * 5 : 8 + (i % 4), comments: peak ? 9 : 1, shares: peak ? 4 : 0 });
    }
    return rows;
  };
  const demoPublisher = {
    async publish() { await wait(700); return { id: "demo-" + Date.now() }; },
    async verify() { return { name: "Page démo" }; },
    async history() { await wait(900); return history(); },
  };
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

  // ---------------------------------------------------------------- peak times, computed by DOLPHin's own algorithm
  const HEAT = ["#cde2fb", "#9ec5f4", "#5598e7", "#256abf", "#104281"];
  const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
  const BLOCKS = [6, 9, 12, 15, 18, 21];
  const report = analyzePeaks(history());
  const map = document.getElementById("peak-map");
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  map.innerHTML = `<div class="r h"><span></span>${BLOCKS.map(h => `<span>${h} h</span>`).join("")}</div>` + DAYS.map((day, d) =>
    `<div class="r"><span>${day.slice(0, 3)}</span>${BLOCKS.map(from => {
      const v = Math.max(...report.grid[d].slice(from, from + 3));
      const label = `${day}, ${from} h – ${from + 3} h : ${Math.round(v * 100)} % du meilleur créneau`;
      return `<span class="c" style="background:${HEAT[Math.min(4, Math.floor(v * 5))]}" title="${esc(label)}" aria-label="${esc(label)}" role="img"></span>`;
    }).join("")}</div>`).join("");
  document.getElementById("peak-best").innerHTML = report.best.map((b, i) => `<span>${i + 1}. ${DAYS[b.day]} <b>${b.hour} h</b></span>`).join("");
})();
