CREATE TABLE `orderAttention` (
	`id` int AUTO_INCREMENT NOT NULL,
	`registrationId` int NOT NULL,
	`adminName` varchar(128) NOT NULL DEFAULT 'Admin',
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp NOT NULL,
	CONSTRAINT `orderAttention_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `folderConfig` ADD `tabOrder` int DEFAULT 0 NOT NULL;