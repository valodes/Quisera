CREATE TABLE `recipe` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text DEFAULT 'house' NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`photo_key` text,
	`photo_mime_type` text,
	`photo_url` text,
	`total_minutes` integer,
	`difficulty` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recipe_photo_key_unique` ON `recipe` (`photo_key`);--> statement-breakpoint
CREATE INDEX `recipe_source_created_idx` ON `recipe` (`source`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `recipe_title_idx` ON `recipe` (`title`);--> statement-breakpoint
CREATE TABLE `recipe_external_reference` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`source` text NOT NULL,
	`external_id` text NOT NULL,
	`last_synced_at` integer,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipe`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recipe_external_reference_recipe_id_unique` ON `recipe_external_reference` (`recipe_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `recipe_external_source_id_unique` ON `recipe_external_reference` (`source`,`external_id`);--> statement-breakpoint
CREATE TABLE `recipe_favorite` (
	`user_id` text NOT NULL,
	`recipe_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `recipe_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipe`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recipe_favorite_recipe_idx` ON `recipe_favorite` (`recipe_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `recipe_ingredient` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`position` integer NOT NULL,
	`name` text NOT NULL,
	`quantity` text,
	`unit` text,
	`notes` text,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipe`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recipe_ingredient_position_unique` ON `recipe_ingredient` (`recipe_id`,`position`);--> statement-breakpoint
CREATE TABLE `recipe_metric` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`unit` text,
	`provenance` text,
	`method` text,
	`recorded_at` integer,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipe`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recipe_metric_key_unique` ON `recipe_metric` (`recipe_id`,`key`);--> statement-breakpoint
CREATE TABLE `recipe_step` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`position` integer NOT NULL,
	`instructions` text NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipe`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recipe_step_position_unique` ON `recipe_step` (`recipe_id`,`position`);--> statement-breakpoint
CREATE TABLE `recipe_tag` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recipe_tag_kind_name_unique` ON `recipe_tag` (`kind`,`normalized_name`);--> statement-breakpoint
CREATE INDEX `recipe_tag_name_idx` ON `recipe_tag` (`normalized_name`);--> statement-breakpoint
CREATE TABLE `recipe_tag_assignment` (
	`recipe_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`recipe_id`, `tag_id`),
	FOREIGN KEY (`recipe_id`) REFERENCES `recipe`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `recipe_tag`(`id`) ON UPDATE no action ON DELETE cascade
);
