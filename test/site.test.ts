// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { snapshotFromDocument } from "../src/adapters/site.js";

it("reads a business page", () => {
  document.documentElement.setAttribute("lang", "fr");
  document.head.innerHTML = `<title>Le Fournil · Boulangerie</title>
    <meta name="description" content="Pain au feu de bois à Cocody">
    <meta name="theme-color" content="#6b3e1f">
    <link rel="icon" href="/favicon.ico"><link rel="apple-touch-icon" sizes="180x180" href="/apple.png">
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Bakery","name":"Le Fournil","telephone":"+225 01 02 03 04","address":{"addressLocality":"Cocody","addressCountry":"CI"},"logo":{"url":"/img/ld-logo.png"}}]}</script>`;
  document.body.innerHTML = `<header><img src="/img/logo.svg" alt="Logo"></header>
    <h1>Pain chaud tous les matins</h1><h2>Nos produits</h2><p>Baguettes,   croissants.</p>
    <a href="tel:+22501020304">Appeler</a><a href="https://wa.me/2250102030405">WhatsApp</a><a href="mailto:bonjour@fournil.ci">Écrire</a>
    <script>secret()</script><dolphin-studio>Admin</dolphin-studio>`;
  const s = snapshotFromDocument(document, "https://fournil.ci/accueil");
  expect(s).toMatchObject({
    lang: "fr", title: "Le Fournil · Boulangerie", description: "Pain au feu de bois à Cocody", siteName: "Le Fournil", themeColor: "#6b3e1f",
    headings: ["Pain chaud tous les matins", "Nos produits"],
    phones: ["+225 01 02 03 04", "+22501020304"], whatsapp: ["+2250102030405"], emails: ["bonjour@fournil.ci"],
    structured: { name: "Le Fournil", telephone: "+225 01 02 03 04", address: "Cocody, CI", logo: "/img/ld-logo.png" },
  });
  expect(s.logoCandidates).toEqual(["https://fournil.ci/img/ld-logo.png", "https://fournil.ci/img/logo.svg", "https://fournil.ci/apple.png", "https://fournil.ci/favicon.ico"]);
  expect(s.text).toContain("Baguettes, croissants.");
  expect(s.text).not.toContain("secret()");
  expect(s.text).not.toContain("Admin");
});
