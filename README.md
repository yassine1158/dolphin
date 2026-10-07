# DOLPHin 🐬 · studio IA intégrable

[![CI](https://github.com/yassine1158/dolphin/actions/workflows/ci.yml/badge.svg)](https://github.com/yassine1158/dolphin/actions/workflows/ci.yml) [![Licence : AGPL-3.0](https://img.shields.io/badge/licence-AGPL--3.0-blue)](LICENSE) [![Licence commerciale](https://img.shields.io/badge/licence-commerciale-orange)](COMMERCIAL-LICENSE.md)

DOLPHin écrit les publications d'une entreprise, dessine l'affiche à ses couleurs, puis la publie ou la programme sur sa page Facebook. Il s'installe sur **n'importe quel site web**, quel que soit le langage du serveur : il suffit d'une balise `<script>` et d'un composant `<dolphin-studio>`.

> Statut : **bêta, en phase de test** (v0.3.0).

## Essayer en 2 minutes (sur votre ordinateur)

1. Installez **Node.js 22** ou plus récent : https://nodejs.org
2. Téléchargez le projet (bouton vert **Code → Download ZIP** sur GitHub, puis dézippez), ou bien `git clone https://github.com/yassine1158/dolphin`.
3. Dans le dossier, copiez `.env.example` en `.env`, puis collez votre clé Claude (`ANTHROPIC_API_KEY=sk-ant-…`). Les lignes `META_*` sont optionnelles : elles servent à publier sur Facebook.
4. Ouvrez un terminal dans le dossier et lancez :

   ```bash
   npm install
   npm run demo
   ```

5. Ouvrez **http://localhost:8787** : cliquez sur « Générer les publications ».

Sans les lignes `META_*`, vous pouvez générer, modifier, télécharger les affiches et copier les textes. Avec elles, les boutons « Programmer » et « Publier maintenant » apparaissent.

## Intégration en 3 étapes

```html
<!-- 1. Le script -->
<script src="https://votre-cdn/dolphin.lite.js" defer></script>

<!-- 2. Le composant, configuré en JSON -->
<dolphin-studio>
  <script type="application/json">
  {
    "endpoint": "https://api.votre-site.com/dolphin",
    "token": "…",
    "brand": {
      "id": "acme", "name": "ACME", "language": "fr",
      "contact": { "whatsapp": "+225 07 00 00 00 00", "callToAction": "Commande sur WhatsApp" },
      "products": [{ "name": "Œufs à couver", "status": "available" }, { "name": "Aliments", "status": "soon" }],
      "colors": { "primary": "#0b3f2f", "accent": "#f3811d" }
    }
  }
  </script>
</dolphin-studio>
```

3. Lancez le serveur, qui garde les clés :

```bash
ANTHROPIC_API_KEY=sk-ant-… META_PAGE_ID=… META_PAGE_TOKEN=… \
DOLPHIN_API_TOKEN=un-secret-long DOLPHIN_ALLOWED_ORIGINS=https://www.votre-site.com \
npx dolphin-server
```

On peut aussi monter le composant en JavaScript avec `Dolphin.mount("#studio", config)`. Exemples complets dans [`examples/`](examples) : HTML simple, analyse automatique d'un site (`examples/auto`), mode direct, React/Next.js, extension WordPress.

## DOLPHin comprend votre site tout seul

Il n'est pas nécessaire de décrire la marque : sans `brand` dans la configuration, DOLPHin lit le site, puis propose tout lui-même.

```html
<dolphin-studio>
  <script type="application/json">{ "endpoint": "https://api.votre-site.com/dolphin", "token": "…", "siteUrl": "/" }</script>
</dolphin-studio>
```

1. **Lecture du site** (`siteUrl`, par défaut la page d'accueil) : titre, description, données schema.org, titres, texte, téléphones, liens WhatsApp, e-mails et logos possibles.
2. **Compréhension par Claude** : activité, clientèle, ville, produits disponibles ou à venir, appel à l'action, plus **6 à 8 idées de publications**, chacune avec son angle et la raison de la publier. Le contenu de la page est traité comme une donnée, jamais comme une instruction.
3. **Logo et couleurs** : le logo est repris du site, en cherchant dans cet ordre schema.org, l'en-tête, les icônes puis l'image de partage. Les couleurs sont extraites du logo. Vous pouvez aussi **envoyer votre propre logo** (PNG, JPEG, WebP ou SVG).
4. **Vous vérifiez, corrigez et enregistrez le profil.** Ensuite, « Écrire ce post » transforme une idée en publication avec son affiche.

Quand la marque vient du site hôte (`brand` fourni, comme dans un CMS), DOLPHin ne la modifie jamais : il propose seulement des idées.

## Pourquoi ça marche avec tous les sites

| Couche | Ce qui la rend universelle |
|---|---|
| **Interface** | Web Component standard avec Shadow DOM : aucun conflit de CSS ou de JavaScript avec le site, aucun framework requis. Fonctionne en HTML simple, WordPress, PHP, Django, Rails, Laravel, React, Vue, Angular. |
| **Serveur** | Contrat REST décrit dans [`openapi.yaml`](openapi.yaml), 5 routes. Utilisez `dolphin-server` (Node, sans dépendance de framework), placez-le derrière votre serveur actuel (nginx, Apache…), ou réimplémentez les 5 routes dans votre langage. |
| **Langues** | Interface en français, anglais et arabe (de droite à gauche). Les publications sont écrites dans la langue de la marque. |

Exemple nginx, pour servir DOLPHin sous le même domaine qu'un site PHP, Python ou autre :

```nginx
location /dolphin/ { proxy_pass http://127.0.0.1:8787/; }
```

## Deux modes

- **Proxy (recommandé)** : les clés Claude et Meta restent sur le serveur. Le navigateur n'envoie que la marque et la demande. Fichier : `dolphin.lite.js`, environ 18 Ko gzip.
- **Direct** : pour une page d'administration privée sans serveur. Les clés sont saisies dans le navigateur, puis chiffrées sur l'appareil (AES-GCM 256, clé dérivée par PBKDF2-SHA256, 310 000 itérations). Fichier : `dolphin.js`, environ 73 Ko gzip, avec le SDK Claude.

### Clés gérées par le site hôte

Si votre administration a déjà sa propre connexion et son propre stockage chiffré, passez les clés au composant. L'écran de phrase secrète disparaît, et le composant vous prévient quand l'utilisateur change une clé :

```js
Dolphin.mount("#studio", {
  mode: "direct",
  brand,
  secrets: { claudeKey, metaPageId, metaToken },
  onSecretsChange: async next => { /* enregistrez `next` dans votre coffre */ },
});
```

## Architecture

Architecture hexagonale (ports et adaptateurs) : le cœur ne dépend d'aucun fournisseur. On peut donc remplacer Claude, Meta ou le stockage sans toucher aux règles métier.

```
src/
  core/       modèle, règles de marque, prompts, schéma JSON, planning, coût   ← pur, testé
  ports/      interfaces : LlmPort, PublisherPort, PosterRenderer, KeyValueStore
  adapters/   Claude (SDK officiel) · Meta Graph API · HTTP (proxy) · stockage · coffre chiffré
  render/     affiche 1080×1350 en Canvas 2D, palette dérivée des couleurs de la marque
  app/        cas d'usage : DolphinStudio (générer, modifier, publier, programmer)
  widget/     composant <dolphin-studio>, i18n fr / en / ar
  server/     handler HTTP Node + CLI dolphin-server
```

Garanties du cœur :

- Seuls les produits **disponibles** sont vendus. Les autres sont annoncés comme « bientôt ».
- Pas de prix, de quantité ni d'unité par défaut (`rules.hidePrices`), plus vos sujets interdits (`rules.neverMention`).
- Le modèle reçoit un **schéma JSON** (sortie structurée). Sa réponse est ensuite revalidée côté client (`parseDrafts`).
- La programmation Meta est vérifiée avant l'envoi (entre 10 minutes et 30 jours).
- Rien n'est publié sans un clic humain.

## Sécurité

- En mode proxy, définissez toujours `DOLPHIN_API_TOKEN` et `DOLPHIN_ALLOWED_ORIGINS`.
- Le jeton est visible par les utilisateurs de la page : intégrez le composant uniquement dans un espace d'administration authentifié.
- Le serveur limite la taille des requêtes, n'accepte que des images PNG (8 Mo maximum), et compare les jetons en temps constant.
- Pour une marque fixe côté serveur, utilisez `DOLPHIN_BRAND_FILE` : la marque envoyée par le navigateur est alors ignorée.

## Développement

```bash
npm install
npm run typecheck   # TypeScript strict
npm test            # 42 tests unitaires (cœur, analyse, couleurs, adaptateurs, serveur)
npm run build       # dist/: dolphin.js, dolphin.lite.js, dolphin.esm.js, server.mjs, types
npm run e2e         # navigateur réel : proxy, direct, clés de l'hôte, analyse du site, arabe (Playwright)
npm run demo        # démo locale avec vos vraies clés (.env)
```

Variables du serveur : voir l'en-tête de [`src/server/cli.ts`](src/server/cli.ts).

## Licence

DOLPHin est **open source sous [GNU AGPL-3.0](LICENSE)**, avec une **[licence commerciale](COMMERCIAL-LICENSE.md)** au choix (double licence) :

- **AGPL-3.0, gratuite** : vous pouvez utiliser, modifier et redistribuer DOLPHin. Si vous le modifiez et qu'on l'utilise à travers un réseau (un site, un service en ligne), vous devez publier le code source de votre version sous AGPL-3.0.
- **Licence commerciale** : pour l'intégrer sans publier votre code, le revendre à vos clients (agence, hébergeur, SaaS, marque blanche) ou obtenir support et garantie.

Pour contribuer, voir [CONTRIBUTING.md](CONTRIBUTING.md) : un [CLA](CLA.md) est demandé. Les logiciels libres inclus, dont le SDK Claude (MIT), sont listés dans [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

---

Conçu et développé par **Yassine Chaabane**.
