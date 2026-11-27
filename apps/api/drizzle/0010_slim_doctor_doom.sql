CREATE TABLE `fridge_item` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`quantity` text,
	`unit` text,
	`zone` text DEFAULT 'fridge' NOT NULL,
	`expires_on` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `fridge_item_zone_expires_idx` ON `fridge_item` (`zone`,`expires_on`);--> statement-breakpoint
CREATE INDEX `fridge_item_normalized_name_idx` ON `fridge_item` (`normalized_name`);--> statement-breakpoint
ALTER TABLE `household_planning_preferences` ADD `default_servings` integer;