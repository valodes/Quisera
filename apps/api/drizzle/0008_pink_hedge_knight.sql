CREATE TABLE `household_planning_preferences` (
	`household_id` text PRIMARY KEY NOT NULL,
	`fresh_products_max_days` integer,
	`required_slots_json` text DEFAULT '[]' NOT NULL,
	`excluded_slots_json` text DEFAULT '[]' NOT NULL,
	`weekday_max_prep_minutes` integer,
	`long_recipe_days_json` text DEFAULT '[6,0]' NOT NULL,
	`max_daily_calories` integer,
	`calorie_balance` text DEFAULT 'neutral' NOT NULL,
	`avoid_consecutive_same_protein` integer DEFAULT true NOT NULL,
	`avoid_consecutive_same_starch` integer DEFAULT true NOT NULL,
	`preserve_manual_meals` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `delivery_selection` ADD `calories_kcal` integer;