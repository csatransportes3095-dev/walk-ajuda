CREATE TABLE `adminLoginAttempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ip` varchar(64) NOT NULL,
	`attempts` int NOT NULL DEFAULT 1,
	`blocked` int NOT NULL DEFAULT 0,
	`lastAttemptAt` timestamp NOT NULL DEFAULT (now()),
	`blockedAt` timestamp,
	`unlockedAt` timestamp,
	CONSTRAINT `adminLoginAttempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orderProgressConfig` (
	`id` int AUTO_INCREMENT NOT NULL,
	`registrationId` int NOT NULL,
	`subOrderIndex` int NOT NULL DEFAULT 0,
	`statusKey` varchar(64) NOT NULL,
	`progressOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `orderProgressConfig_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `accessCodePhones` ADD `rgCnhApproved` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orderStatusTypes` ADD `showInProgress` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orderStatusTypes` ADD `progressOrder` int DEFAULT 0 NOT NULL;