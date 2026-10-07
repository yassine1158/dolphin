// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Yassine Chaabane. Commercial license: COMMERCIAL-LICENSE.md
//
// Presentation page: the example posters and the peak-time map are produced by DOLPHin's own
// renderer and algorithm, from a fictional bakery ("Le Fournil"). No network call, no API key.
(function () {
  "use strict";
  const { CanvasPosterRenderer, analyzePeaks } = window.Dolphin;

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

  // a fictional page history: the bakery's audience reacts most on weekday evenings and Saturday mornings
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
