CREATE TABLE `referralLinks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`customerName` varchar(128) NOT NULL DEFAULT '',
	`code` varchar(32) NOT NULL,
	`commissionValue` int NOT NULL DEFAULT 0,
	`commissionType` varchar(16) NOT NULL DEFAULT 'fixed',
	`usageCount` int NOT NULL DEFAULT 0,
	`active` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `referralLinks_id` PRIMARY KEY(`id`),
	CONSTRAINT `referralLinks_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `referralUsages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`referralLinkId` int NOT NULL,
	`registrationId` int,
	`clientName` varchar(128) NOT NULL DEFAULT '',
	`clientPhone` varchar(32) NOT NULL DEFAULT '',
	`commissionPaid` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `referralUsages_id` PRIMARY KEY(`id`)
);
