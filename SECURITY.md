# Sécurité

Si vous découvrez une faille (fuite de clé, contournement du jeton du serveur, injection…), **ne l'ouvrez pas en issue publique**. Signalez-la de façon privée via l'onglet **Security → Report a vulnerability** du dépôt GitHub. Vous recevrez une réponse dès que possible. Merci de laisser le temps de corriger avant toute publication.

## Mesures en place (v0.4)

- Serveur : jeton Bearer comparé en temps constant, liste d'origines CORS, refus des origines non autorisées, `POST` en JSON uniquement, limite de débit par IP, tailles de corps bornées, en-têtes `no-store`, `nosniff`, `DENY`, CSP, jeton refusé dans l'URL, erreurs internes jamais journalisées en clair.
- Facebook : `appsecret_proof` (avec `META_APP_SECRET`), jeton dans le corps des requêtes `POST`, liens de pagination suivis uniquement vers `graph.facebook.com`.
- Navigateur : coffre AES-GCM 256 / PBKDF2-SHA256 à 600 000 itérations, délai croissant après 3 phrases fausses, verrouillage après 15 minutes d'inactivité, contenu du site envoyé à l'IA comme donnée et jamais comme instruction, tout texte affiché échappé, URL limitées à `http(s)`.
- Exports : CSV protégé contre l'injection de formules ; photos réencodées sans métadonnées.
