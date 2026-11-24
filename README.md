# Quisera

PWA privée du foyer pour organiser les repas et cuisiner. L’interface est en français ; les routes applicatives demandent une session. Aucun fonctionnement hors ligne n’est fourni.

## Prérequis et premier démarrage

- Node.js 26 LTS, pnpm 12.23.0, Docker et Docker Compose.
- Copier `.env.example` vers `.env`, puis renseigner `BETTER_AUTH_SECRET` avec au moins 32 caractères aléatoires (`openssl rand -hex 32`). Ne jamais committer `.env`.
- Installer et lancer les migrations une fois :

```sh
pnpm install --frozen-lockfile
pnpm --filter @quisera/api db:migrate
pnpm dev
```

Le shell de développement est disponible sur `http://localhost:3131` et l’API sur le proxy de même origine. Une migration n’est jamais lancée automatiquement au démarrage.

## Docker Compose

Le script `./start-dev` gère le conteneur de développement (`./start-dev -h` pour la liste des options : `-r` reset/rebuild, `-n` bash dans `dev`, `-l` logs, `-b` restart, `-k` kill, `--ps`, `--migrate`, `--test`, `--check`). Au premier lancement, il crée `.env` depuis `.env.example` avec un `BETTER_AUTH_SECRET` généré si absent.

```sh
./start-dev --migrate
./start-dev
```

L’application de développement est sur `http://localhost:3131`. Le service Compose `app`, activé uniquement par le profil `production`, sert le frontend et Hono dans un conteneur non-root et conserve SQLite dans le volume `app_data`. Avant son démarrage, injecter les variables de production requises (`APP_URL` HTTPS, `TRUSTED_ORIGINS`, `BETTER_AUTH_SECRET`) et appliquer explicitement les migrations :

```sh
docker compose --profile production build app
docker compose --profile production run --rm app node dist/db/migrate.js
docker compose --profile production up -d app
```

## Comptes et base

Inscription publique désactivée côté serveur. Créer le premier administrateur uniquement dans une base vide ; le mot de passe est demandé sans écho :

```sh
pnpm --filter @quisera/api run auth:create-admin -- --email <email> --name <nom>
```

Après cette initialisation, créer le deuxième utilisateur ou réinitialiser un mot de passe depuis le CLI serveur authentifié :

```sh
pnpm --filter @quisera/api run users -- create --email <email> --name <nom>
pnpm --filter @quisera/api run users -- reset-password --email <email>
```

En production Docker, l’administrateur initial, le second compte et la réinitialisation utilisent le même CLI serveur. `-it` conserve l’invite TTY qui lit le mot de passe sans écho :

```sh
docker compose --profile production run --rm -it app node dist/cli/users.js bootstrap-admin --email <email> --name <nom>
docker compose --profile production run --rm -it app node dist/cli/users.js create --email <email> --name <nom>
docker compose --profile production run --rm -it app node dist/cli/users.js reset-password --email <email>
```

Les sauvegardes, restaurations et contrôles d’intégrité SQLite sont décrits dans [docs/sqlite-operations.md](docs/sqlite-operations.md).

## Bibliothèque de recettes

La bibliothèque privée utilise `GET /api/recipes` (recherche `q`, source, catégorie, tri et pagination), `GET /api/recipes/favorites`, `GET /api/recipes/:id`, `POST /api/recipes`, `PUT` et `DELETE /api/recipes/:id`, ainsi que `POST`/`DELETE /api/recipes/:id/favorite`. Les recettes maison acceptent des photos JPEG, PNG ou WebP jusqu’à 8 Mo, conservées dans `RECIPE_UPLOAD_DIR` (volume persistant `/data/recipe-photos` en production).

Le planning est partagé entre les comptes. Chaque cycle compte 14 créneaux depuis le soir de la date `deliveryDate` réellement renvoyée par Quitoque jusqu’au déjeuner sept jours plus tard. Les synchronisations Quitoque sont manuelles, authentifiées et en lecture seule ; elles importent uniquement les recettes associées aux commandes. Configurer `QUITOQUE_MAIL` et `QUITOQUE_MAIL_PASSWORD` dans `.env`. Les migrations sont explicites : `pnpm --filter @quisera/api db:generate`, puis `pnpm --filter @quisera/api db:migrate`. Routes protégées : `GET /api/planning?from=YYYY-MM-DD&to=YYYY-MM-DD`, `POST /api/planning/quitoque/sync`, `POST /api/planning/deliveries/:id/recipes/sync`, `POST /api/planning/deliveries/:id/distribute`, `PUT /api/planning/slots`, `POST /api/planning/slots/move` et `DELETE /api/planning/slots/:date/:period`. Voir [docs/recipes.md](docs/recipes.md), [docs/planning.md](docs/planning.md) et [docs/quitoque-api-discovery.md](docs/quitoque-api-discovery.md).

## Qualité

```sh
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test:unit
pnpm test:e2e
pnpm build
```
