CREATE TABLE `customerPasswordSessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`phone` varchar(32) NOT NULL,
	`token` varchar(255) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`lastAccessAt` timestamp,
	CONSTRAINT `customerPasswordSessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `customerPasswordSessions_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `customerPasswords` (
	`id` int AUTO_INCREMENT NOT NULL,
	`phone` varchar(32) NOT NULL,
	`password` varchar(255) NOT NULL,
	`isActive` int NOT NULL DEFAULT 1,
	`expiresAt` timestamp,
	`pendingApproval` int NOT NULL DEFAULT 0,
	`createdByClient` int NOT NULL DEFAULT 0,
	`clientCreatedAt` timestamp,
	`preservedExpiresAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customerPasswords_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `homeButtons` ADD `linkType` varchar(32) DEFAULT 'custom' NOT NULL;--> statement-breakpoint
ALTER TABLE `homeButtons` ADD `openInNewTab` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `homeButtons` ADD `vipOnly` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `spreadsheetClients` ADD `cpf` varchar(14);--> statement-breakpoint
ALTER TABLE `spreadsheetClients` ADD `preservedExpiresAt` timestamp;