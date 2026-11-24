CREATE TABLE `recipe_sync_state` (
	`source` text PRIMARY KEY NOT NULL,
	`last_synced_at` integer NOT NULL,
	`last_added` integer NOT NULL,
	`last_updated` integer NOT NULL
);
