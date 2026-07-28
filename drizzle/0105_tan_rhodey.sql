CREATE TABLE `adCampaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(256) NOT NULL,
	`isActive` int NOT NULL DEFAULT 1,
	`type` enum('image','video') NOT NULL DEFAULT 'image',
	`imageUrl` text,
	`videoUrl` text,
	`title` varchar(256),
	`description` text,
	`linkUrl` text,
	`linkText` varchar(128) DEFAULT 'Saiba Mais',
	`linkTarget` enum('_self','_blank') NOT NULL DEFAULT '_blank',
	`requiredSeconds` int NOT NULL DEFAULT 20,
	`frequency` enum('once','every_access','every_reload','custom') NOT NULL DEFAULT 'every_access',
	`frequencyMinutes` int,
	`startsAt` timestamp,
	`endsAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `adCampaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `adImpressions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`clientId` int NOT NULL,
	`shownAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `adImpressions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `spreadsheetSessions` ADD `accessCount` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `spreadsheetSessions` ADD `lastAccessAt` timestamp;--> statement-breakpoint
ALTER TABLE `adImpressions` ADD CONSTRAINT `adImpressions_campaignId_adCampaigns_id_fk` FOREIGN KEY (`campaignId`) REFERENCES `adCampaigns`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `adImpressions` ADD CONSTRAINT `adImpressions_clientId_spreadsheetClients_id_fk` FOREIGN KEY (`clientId`) REFERENCES `spreadsheetClients`(`id`) ON DELETE cascade ON UPDATE no action;