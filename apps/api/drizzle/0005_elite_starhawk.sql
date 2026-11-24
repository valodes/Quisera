ALTER TABLE `delivery_selection` ADD `ingredients_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `delivery_selection` ADD `steps_json` text DEFAULT '[]' NOT NULL;