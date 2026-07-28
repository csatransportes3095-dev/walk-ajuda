CREATE TABLE `spreadsheetClients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`name` varchar(128) NOT NULL,
	`phone` varchar(32),
	`passwordHash` varchar(255) NOT NULL,
	`status` enum('active','blocked') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `spreadsheetClients_id` PRIMARY KEY(`id`),
	CONSTRAINT `spreadsheetClients_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `spreadsheetLoginAudit` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientId` int,
	`email` varchar(320),
	`status` enum('success','failed','blocked') NOT NULL,
	`ipAddress` varchar(45),
	`userAgent` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `spreadsheetLoginAudit_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `spreadsheetPasswords` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientId` int NOT NULL,
	`password` varchar(255) NOT NULL,
	`isActive` int NOT NULL DEFAULT 1,
	`expiresAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`createdBy` int,
	CONSTRAINT `spreadsheetPasswords_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `spreadsheetSessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientId` int NOT NULL,
	`token` varchar(255) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `spreadsheetSessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `spreadsheetSessions_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
ALTER TABLE `spreadsheetLoginAudit` ADD CONSTRAINT `spreadsheetLoginAudit_clientId_spreadsheetClients_id_fk` FOREIGN KEY (`clientId`) REFERENCES `spreadsheetClients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `spreadsheetPasswords` ADD CONSTRAINT `spreadsheetPasswords_clientId_spreadsheetClients_id_fk` FOREIGN KEY (`clientId`) REFERENCES `spreadsheetClients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `spreadsheetSessions` ADD CONSTRAINT `spreadsheetSessions_clientId_spreadsheetClients_id_fk` FOREIGN KEY (`clientId`) REFERENCES `spreadsheetClients`(`id`) ON DELETE cascade ON UPDATE no action;