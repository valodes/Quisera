# Quisera — instructions Codex

## Identité

- Quisera est une application privée destinée à un foyer.
- L'interface utilisateur est en français ; identifiants techniques, code et commentaires sont en anglais.

## Architecture

- Monorepo pnpm sans Nx ni Turborepo : `apps/web` (Vue 3, TypeScript strict, Vite, Vue Router, Tailwind CSS 4, Reka UI, shadcn-vue, Lucide Vue), `apps/api` (Hono, Node.js LTS, TypeScript strict) et `packages/shared`.
- `apps/api/src/db` centralise SQLite, Drizzle et ses migrations versionnées ; Zod valide les données aux frontières HTTP. Étendre le schéma uniquement pour les besoins produit établis.
- Docker Compose est l'environnement de développement obligatoire.
- Privilégier la simplicité, la séparation des responsabilités et l'absence d'overengineering. Valider les données aux frontières.

## Conventions

- Écrire du code lisible et maintenable ; justifier toute nouvelle dépendance.
- Créer des composants accessibles et tester de façon proportionnée aux changements.
- Respecter le périmètre demandé ; éviter documentation et rapports inutiles.
- Lire ce fichier avant toute intervention. Utiliser Repowise pour comprendre le dépôt, les skills Matt Pocock lorsqu'ils sont pertinents et Impeccable pour le travail de design.
- Tester et vérifier avant de conclure ; ne jamais inventer de résultats.
- Préserver les blocs gérés automatiquement par les outils. Ne jamais pousser Git sans demande explicite.

## Contraintes produit futures

- Chaque cycle de planning commence le soir de la date de livraison Quitoque réellement retournée, se termine au déjeuner sept jours plus tard et contient 14 créneaux chronologiques. Ne jamais supposer un jour fixe.
- Desktop sert à l'organisation ; mobile et tablette servent au Cooking Mode.
- La PWA est installable, avec connexion Internet obligatoire et sans mode offline.
- Les photos de recettes restent complètes, sans détourage.
- Les cards affichent durée, difficulté, Nutri-Score et score carbone lorsqu'ils sont disponibles. Elles n'affichent ni nombre de personnes ni CTA « Ajouter au planning ».

## Identité graphique future

- Sharp Grotesk 20 pour les titres et Graphik pour les textes, uniquement avec les licences appropriées.
- Palette : vert forêt `#173D2C`, terracotta `#C74832`, vert feuille `#2F744E`, sauge `#D7E8D6`, pêche `#FCE3D8`, jeune pousse `#DAF097`, corail `#F08262`, rouge tomate `#E74D43`.
- Aucun blanc, gris, marron, beige ou noir dans l'interface.
- S'inspirer de Nory AI et Awwwards sans copier.
- Lors de l'usage futur de shadcn-vue, remplacer ses tokens neutres par la palette Quisera avant de livrer une interface.
- La source des tokens d'interface est `apps/web/src/styles/tokens.css` ; consulter `DESIGN.md` avant tout changement visuel. Les rampes de `.impeccable/design.json` sont réservées à l'aperçu documentaire, jamais aux interfaces.

## Quitoque

- Source de vérité unique et obligatoire : `https://app.quitoque.fr/api/v2`.
- Aucune autre API Quitoque, aucun endpoint alternatif et aucun connecteur de l'ancien projet.
- Ne pas supposer des endpoints, contrats ou droits d'accès non vérifiés. Lire uniquement les dates de livraison et sélections réellement associées aux commandes ; ne pas réimporter le catalogue entier dans la bibliothèque.

## Limites de phase

Le dépôt est greenfield. Ne consulter, copier ni réutiliser aucun code, fichier, architecture ou configuration de Quitoque+ ou d'un autre projet. Tant que cela n'est pas explicitement demandé, ne créer ni page, composant applicatif, fonctionnalité métier, route API, modèle métier, fixture, fausse API ou intégration externe.
