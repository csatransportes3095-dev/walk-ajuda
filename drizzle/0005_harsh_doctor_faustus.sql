CREATE TABLE `optionDocuments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`optionId` int NOT NULL,
	`label` varchar(128) NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `optionDocuments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `productOptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`label` varchar(128) NOT NULL,
	`price` varchar(64) NOT NULL,
	`type` varchar(32) NOT NULL DEFAULT 'standard',
	`requireProfilePhoto` int NOT NULL DEFAULT 0,
	`requireCarDocument` int NOT NULL DEFAULT 0,
	`requireAlvara` int NOT NULL DEFAULT 0,
	`requireCondutaxi` int NOT NULL DEFAULT 0,
	`requireVehicle2016` int NOT NULL DEFAULT 0,
	`isPdfOnly` int NOT NULL DEFAULT 0,
	`showYearField` int NOT NULL DEFAULT 0,
	`docNameMode` varchar(32) NOT NULL DEFAULT 'none',
	`docCustomName` varchar(128) DEFAULT '',
	`sortOrder` int NOT NULL DEFAULT 0,
	`isActive` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `productOptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `productQuestions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`optionId` int,
	`question` varchar(256) NOT NULL,
	`fieldType` enum('text','select','textarea') NOT NULL DEFAULT 'text',
	`options` text,
	`isRequired` int NOT NULL DEFAULT 1,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `productQuestions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `siteSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`settingKey` varchar(128) NOT NULL,
	`settingValue` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `siteSettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `siteSettings_settingKey_unique` UNIQUE(`settingKey`)
);
--> statement-breakpoint
ALTER TABLE `products` ADD `buttonText` varchar(128) DEFAULT 'COMPRAR' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` DROP COLUMN `valueRandom`;--> statement-breakpoint
ALTER TABLE `products` DROP COLUMN `valueFirst`;--> statement-breakpoint
ALTER TABLE `products` DROP COLUMN `valueFull`;--> statement-breakpoint
ALTER TABLE `products` DROP COLUMN `enableRandom`;--> statement-breakpoint
ALTER TABLE `products` DROP COLUMN `enableFirst`;--> statement-breakpoint
ALTER TABLE `products` DROP COLUMN `enableFull`;