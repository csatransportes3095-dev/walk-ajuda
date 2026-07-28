CREATE TABLE `customerDocuments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`label` varchar(256) NOT NULL,
	`fileUrl` text NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`mimeType` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customerDocuments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `homePageButtons` ADD `icon` varchar(64) DEFAULT 'clipboard' NOT NULL;--> statement-breakpoint
ALTER TABLE `homePageButtons` ADD `linkUrl` varchar(512) DEFAULT '' NOT NULL;