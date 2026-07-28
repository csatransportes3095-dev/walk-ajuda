CREATE TABLE `resellerOrders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`resellerId` int NOT NULL,
	`registrationId` int NOT NULL,
	`customerPhone` varchar(32) NOT NULL,
	`salePrice` varchar(64) NOT NULL,
	`costPrice` varchar(64) NOT NULL DEFAULT '',
	`commissionPaid` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `resellerOrders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `resellerPrices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`resellerId` int NOT NULL,
	`optionId` int NOT NULL,
	`salePrice` varchar(64) NOT NULL,
	`costPrice` varchar(64) NOT NULL DEFAULT '',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `resellerPrices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `resellers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`phone` varchar(32) NOT NULL,
	`email` varchar(320),
	`slug` varchar(64) NOT NULL,
	`username` varchar(64) NOT NULL,
	`passwordHash` varchar(256) NOT NULL,
	`isActive` int NOT NULL DEFAULT 1,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `resellers_id` PRIMARY KEY(`id`),
	CONSTRAINT `resellers_phone_unique` UNIQUE(`phone`),
	CONSTRAINT `resellers_slug_unique` UNIQUE(`slug`),
	CONSTRAINT `resellers_username_unique` UNIQUE(`username`)
);
