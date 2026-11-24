# Opérations SQLite

Le chemin est défini par `SQLITE_PATH`. En Compose production, le fichier est `/data/quisera.sqlite`, dans le volume nommé `app_data`. Le processus active les clés étrangères, WAL et une attente de verrouillage de cinq secondes. Les migrations sont explicites.

## Migrations

Depuis la racine du dépôt :

```sh
pnpm --filter @quisera/api db:generate
pnpm --filter @quisera/api db:migrate
```

Le SQL versionné est dans `apps/api/drizzle/`. N’utilisez pas `drizzle-kit push` et ne supprimez pas le volume de production.

En production Docker, après chaque nouvelle migration et avant de redémarrer l’application :

```sh
docker compose --profile production run --rm app node dist/db/migrate.js
```

## Sauvegarde

La commande emploie l’API de sauvegarde en ligne SQLite de `better-sqlite3`, qui inclut les changements WAL de façon cohérente. La destination doit être nouvelle.

```sh
docker compose --profile production exec app node dist/cli/database.js backup /data/quisera-backup.sqlite
docker compose cp app:/data/quisera-backup.sqlite ./quisera-backup.sqlite
```

Conservez une copie exportée hors du volume applicatif et dans un emplacement privé. Ne copiez pas seulement le fichier SQLite actif avec `cp` lorsque WAL est activé.

## Vérification d’intégrité

```sh
docker compose --profile production exec app node dist/cli/database.js integrity
```

La commande exige un résultat `integrity_check` égal à `ok`.

## Restauration

Arrêtez d’abord l’application, copiez la sauvegarde vérifiée dans son conteneur arrêté, puis confirmez le chemin complet dans l’invite interactive. La base courante et ses fichiers WAL/SHM sont remplacés uniquement après confirmation ; les contrôles d’intégrité sont exécutés avant et après la restauration.

```sh
docker compose --profile production stop app
docker compose --profile production cp ./quisera-backup.sqlite app:/data/quisera-backup.sqlite
docker compose --profile production run --rm -it app node dist/cli/database.js restore /data/quisera-backup.sqlite
docker compose --profile production up -d app
```

Cette procédure n’efface pas le volume Compose.
