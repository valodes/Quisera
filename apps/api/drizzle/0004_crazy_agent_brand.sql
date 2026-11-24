CREATE TABLE `delivery_cycle` (
	`id` text PRIMARY KEY NOT NULL,
	`external_order_id` text NOT NULL,
	`delivery_date` text NOT NULL,
	`period_start_date` text,
	`period_end_date` text,
	`last_synced_at` integer,
	`recipes_synced_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `delivery_cycle_external_order_unique` ON `delivery_cycle` (`external_order_id`);--> statement-breakpoint
CREATE INDEX `delivery_cycle_date_idx` ON `delivery_cycle` (`delivery_date`,`id`);--> statement-breakpoint
CREATE TABLE `delivery_selection` (
	`id` text PRIMARY KEY NOT NULL,
	`delivery_cycle_id` text NOT NULL,
	`source_item_id` text NOT NULL,
	`source_product_id` text NOT NULL,
	`source_position` integer NOT NULL,
	`occurrence` integer NOT NULL,
	`quantity` integer NOT NULL,
	`is_available` integer DEFAULT true NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`photo_url` text,
	`photo_thumbnail_url` text,
	`total_minutes` integer,
	`nutri_score` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`delivery_cycle_id`) REFERENCES `delivery_cycle`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `delivery_selection_source_occurrence_unique` ON `delivery_selection` (`delivery_cycle_id`,`source_item_id`,`occurrence`);--> statement-breakpoint
CREATE INDEX `delivery_selection_cycle_order_idx` ON `delivery_selection` (`delivery_cycle_id`,`source_position`,`occurrence`);--> statement-breakpoint
CREATE TABLE `planned_meal` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`period` text NOT NULL,
	`category` text NOT NULL,
	`origin` text DEFAULT 'manual' NOT NULL,
	`delivery_cycle_id` text,
	`delivery_selection_id` text,
	`home_recipe_id` text,
	`restaurant_name` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`delivery_cycle_id`) REFERENCES `delivery_cycle`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`delivery_selection_id`) REFERENCES `delivery_selection`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`home_recipe_id`) REFERENCES `recipe`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `planned_meal_slot_unique` ON `planned_meal` (`date`,`period`);--> statement-breakpoint
CREATE UNIQUE INDEX `planned_meal_selection_unique` ON `planned_meal` (`delivery_selection_id`);--> statement-breakpoint
CREATE INDEX `planned_meal_cycle_idx` ON `planned_meal` (`delivery_cycle_id`,`date`,`period`);--> statement-breakpoint
CREATE INDEX `planned_meal_home_recipe_idx` ON `planned_meal` (`home_recipe_id`);