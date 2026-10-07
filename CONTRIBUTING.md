# Contribuer à DOLPHin

Merci de votre intérêt ! DOLPHin est open source (AGPL-3.0) et disponible sous licence commerciale, voir [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md).

## Avant de proposer une modification

1. Lisez et acceptez le [CLA](CLA.md). Il permet de continuer à proposer la licence commerciale qui finance le projet. Le modèle de pull request vous demande de le confirmer.
2. Pour un changement important, ouvrez d'abord une *issue* pour en discuter.

## Développer

```bash
npm install
npm run typecheck   # TypeScript strict
npm test            # tests unitaires
npm run build       # régénère dist/ : commitez-le avec vos changements
npm run e2e         # navigateur réel (Playwright)
```

Règles du code :

- `src/core` reste pur : pas de DOM, pas de réseau, pas de SDK.
- Les fournisseurs (Claude, Meta…) passent par les interfaces de `src/ports`.
- Tout texte affiché existe en français, en anglais et en arabe (`src/widget/i18n.ts`).
- Un comportement nouveau s'accompagne d'un test.

## Signaler une faille

Ne publiez pas de faille de sécurité dans une *issue* : voir [SECURITY.md](SECURITY.md).
