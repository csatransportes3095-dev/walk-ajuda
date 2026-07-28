CREATE TABLE `blocklist` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('name','phone','both') NOT NULL DEFAULT 'phone',
	`name` varchar(256),
	`phone` varchar(32),
	`reason` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `blocklist_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `system_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`config_key` varchar(100) NOT NULL,
	`config_value` text NOT NULL,
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `system_config_id` PRIMARY KEY(`id`),
	CONSTRAINT `system_config_config_key_unique` UNIQUE(`config_key`)
);
--> statement-breakpoint
ALTER TABLE `orderStatusTypes` ADD `pulseColor` varchar(32) DEFAULT '#ffffff';