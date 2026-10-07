# DOLPHin 🐬 · studio IA intégrable

[![CI](https://github.com/yassine1158/dolphin/actions/workflows/ci.yml/badge.svg)](https://github.com/yassine1158/dolphin/actions/workflows/ci.yml) [![Licence : AGPL-3.0](https://img.shields.io/badge/licence-AGPL--3.0-blue)](LICENSE) [![Licence commerciale](https://img.shields.io/badge/licence-commerciale-orange)](COMMERCIAL-LICENSE.md)

DOLPHin écrit les publications d'une entreprise, dessine l'affiche à ses couleurs, puis la publie ou la programme sur sa page Facebook. Il s'installe sur **n'importe quel site web**, quel que soit le langage du serveur : il suffit d'une balise `<script>` et d'un composant `<dolphin-studio>`.

> Statut : **bêta, en phase de test** (v0.5.0).

**Page de présentation :** https://yassine1158.github.io/dolphin/

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

## Publication automatique aux heures de pointe

DOLPHin lit les réactions, commentaires et partages des 300 dernières publications de la page (permission `pages_read_engagement`). Il en déduit les meilleures heures pour chaque jour de la semaine. Avec « Publier aux heures de pointe », activé par défaut, chaque publication de la série est programmée à l'heure de pointe de son jour, puis Facebook la publie tout seul. Si la page a moins de 8 publications, DOLPHin applique une recommandation générale : midi et soirée en semaine, fin de matinée le week-end.

## Une interface en cinq onglets

**Créer** (idées et génération), **Publications** (avec le nombre de brouillons à traiter), **Calendrier** (publications programmées à venir), **Audience** (heures de pointe et informations) et **Réglages** (connexions et profil du site). L'onglet ouvert est mémorisé, la génération ouvre directement les publications, une pastille du calendrier ouvre la publication concernée, et les flèches du clavier passent d'un onglet à l'autre.

Les données du studio (publications, photos, imports) sont gardées dans **IndexedDB**, qui a de la place pour les photos de fond. Les données d'une ancienne version, dans localStorage, y sont déplacées automatiquement. Si le navigateur n'a plus de place, un message le dit clairement au lieu de perdre les données.

## Ce que disent vos publications (collecte d'informations)

La carte « Ce que disent vos publications » réunit tout ce qu'on sait du public de la page :

- **Chiffres clés** : publications analysées, engagement moyen, rythme (publications par semaine), tendance sur 4 semaines, fiabilité (faible, moyenne, bonne selon la quantité de données et les jours couverts).
- **Engagement moyen par jour** et **par heure de publication**, avec le meilleur jour et la meilleure tranche de 3 heures.
- **Les 5 publications qui ont le mieux marché**, avec un lien vers chacune.
- **Conseils** : rythme trop faible, engagement en baisse ou en hausse, jours jamais testés.
- **Import CSV** : sans jeton de page, ou pour les **publicités**, importez un export de Meta Business Suite (heure de publication, réactions, commentaires, partages) ou du Gestionnaire de publicités ventilé par heure (« Time of day », résultats ou clics). Les colonnes sont reconnues en français et en anglais. Le fichier reste sur l'appareil. Les données de la page et du fichier sont mises à la même échelle, puis combinées pour les heures de pointe.

## Pour les designers

Chaque affiche se règle dans son panneau « Design » :

- **Format** : publication 4:5 (1080×1350), carré 1:1 (1080×1080) ou story 9:16 (1080×1920).
- **Mise en page** : classique, centrée, minimaliste (grand titre, sans points), ou **photo et bandeau** (la photo en haut, le texte en dessous ; sans photo, un bloc aux couleurs de la marque avec le logo en grand).
- **Photo de fond** (JPEG, PNG, WebP), assombrie au réglage voulu pour garder le texte lisible. La photo est réencodée : ses métadonnées (position GPS, appareil) sont supprimées.
- Logo masquable, **« Version story »** en un clic, **Dupliquer**, export **PNG** ou **JPG**.
- Une affiche avec photo part sur Facebook en JPEG, et une affiche PNG de plus de 4 Mo aussi : Facebook refuse les photos plus lourdes.

## Pour les responsables marketing

- **Objectif de campagne** : faire connaître, faire réagir, visites du site, demandes, ventes, événement ou offre. L'IA adapte le texte et l'appel à l'action.
- **Clientèle visée** et **offre** de la campagne (l'IA n'utilise que les faits écrits).
- **Lien suivi** : ajouté à la fin du texte avec `utm_source=facebook`, `utm_medium=social`, `utm_campaign` et `utm_content`, pour mesurer les visites dans Google Analytics.
- **Calendrier** des 4 prochaines semaines, et **export du planning en CSV** (Excel, Google Sheets). Les cellules qui commencent par `=`, `+`, `-` ou `@` sont neutralisées : un tableur ne peut pas les exécuter comme formules.

## Pourquoi ça marche avec tous les sites

| Couche | Ce qui la rend universelle |
|---|---|
| **Interface** | Web Component standard avec Shadow DOM : aucun conflit de CSS ou de JavaScript avec le site, aucun framework requis. Fonctionne en HTML simple, WordPress, PHP, Django, Rails, Laravel, React, Vue, Angular. |
| **Serveur** | Contrat REST décrit dans [`openapi.yaml`](openapi.yaml), 6 routes. Utilisez `dolphin-server` (Node, sans dépendance de framework), placez-le derrière votre serveur actuel (nginx, Apache…), ou réimplémentez les 6 routes dans votre langage. |
| **Langues** | Interface en français, anglais et arabe (de droite à gauche). Les publications sont écrites dans la langue de la marque. |

Exemple nginx, pour servir DOLPHin sous le même domaine qu'un site PHP, Python ou autre :

```nginx
location /dolphin/ { proxy_pass http://127.0.0.1:8787/; }
```

## Deux modes

- **Proxy (recommandé)** : les clés Claude et Meta restent sur le serveur. Le navigateur n'envoie que la marque et la demande. Fichier : `dolphin.lite.js`, environ 18 Ko gzip.
- **Direct** : pour une page d'administration privée sans serveur. Les clés sont saisies dans le navigateur, puis chiffrées sur l'appareil (AES-GCM 256, clé dérivée par PBKDF2-SHA256, 600 000 itérations ; un ancien coffre à 310 000 itérations est rechiffré à l'ouverture). Après 3 phrases fausses, chaque essai attend de plus en plus longtemps. Le studio se verrouille seul après 15 minutes sans activité. Fichier : `dolphin.js`, environ 73 Ko gzip, avec le SDK Claude.

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
- Le serveur limite la taille des requêtes (2 Mo pour l'IA, 12 Mo pour les images), n'accepte que des images PNG ou JPEG (8 Mo maximum, type lu dans le fichier lui-même), et compare les jetons en temps constant, sans révéler leur longueur.
- **Limite de débit** par adresse IP : 20 requêtes IA par minute (`DOLPHIN_RATE_LIMIT`), 120 pour les autres routes. Derrière un proxy inverse, `DOLPHIN_TRUST_PROXY=1` lit l'IP réelle dans `X-Forwarded-For`.
- Les requêtes `POST` doivent être en `application/json` (un formulaire d'un autre site ne passe pas). Un navigateur d'une origine non autorisée reçoit `403` avant tout traitement. Un jeton placé dans l'URL est refusé.
- Chaque réponse porte `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` et une CSP stricte. Les journaux ne contiennent jamais le message d'une erreur interne (il pourrait contenir une clé).
- `META_APP_SECRET` ajoute `appsecret_proof` à chaque appel Facebook : un jeton volé ne sert à rien sans le secret de l'application (activez « Require App Secret » dans l'application Meta). Le jeton de page voyage dans le corps des publications, jamais dans l'URL d'un lien suivant.
- Les URL de logo n'acceptent que `http(s)`, un chemin relatif ou une image `data:` ; les liens suivis que `http(s)`. Les publications relues depuis le stockage sont revalidées.
- Pour une marque fixe côté serveur, utilisez `DOLPHIN_BRAND_FILE` : la marque envoyée par le navigateur est alors ignorée.

## Développement

```bash
npm install
npm run typecheck   # TypeScript strict
npm test            # 88 tests unitaires (cœur, import CSV, informations, campagnes, sécurité, stockage, serveur)
npm run build       # dist/: dolphin.js, dolphin.lite.js, dolphin.esm.js, server.mjs, types
npm run e2e         # 50 contrôles dans un vrai navigateur : proxy, direct, clés de l'hôte, analyse du site, arabe, designer, marketing, audience (Playwright)
npm run demo        # démo locale avec vos vraies clés (.env)
```

La CI lance les deux à chaque PR : typecheck, tests unitaires, build, puis les tests navigateur (les captures d'écran sont gardées 7 jours dans l'onglet Actions).

Variables du serveur : voir l'en-tête de [`src/server/cli.ts`](src/server/cli.ts).

## Page de présentation

Le dossier [`docs/`](docs) contient la page publique (GitHub Pages) : idées clés, fonctionnement détaillé, heures de pointe, intégration et questions fréquentes. Les affiches d'exemple et la carte des heures de pointe sont produites par le vrai moteur de DOLPHin. `npm run build` y recopie `dolphin.lite.js`. Pour la publier : **Settings → Pages → Deploy from a branch → `main` / `docs`**.

## Licence

DOLPHin est **open source sous [GNU AGPL-3.0](LICENSE)**, avec une **[licence commerciale](COMMERCIAL-LICENSE.md)** au choix (double licence) :

- **AGPL-3.0, gratuite** : vous pouvez utiliser, modifier et redistribuer DOLPHin. Si vous le modifiez et qu'on l'utilise à travers un réseau (un site, un service en ligne), vous devez publier le code source de votre version sous AGPL-3.0.
- **Licence commerciale** : pour l'intégrer sans publier votre code, le revendre à vos clients (agence, hébergeur, SaaS, marque blanche) ou obtenir support et garantie.

Pour contribuer, voir [CONTRIBUTING.md](CONTRIBUTING.md) : un [CLA](CLA.md) est demandé. Les logiciels libres inclus, dont le SDK Claude (MIT), sont listés dans [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

---

Conçu et développé par **Yassine Chaabane**.
