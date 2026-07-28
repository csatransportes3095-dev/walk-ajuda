CREATE TABLE `featureCards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(200) NOT NULL,
	`description` text,
	`logoUrl` text,
	`buttonText` varchar(100) NOT NULL DEFAULT 'ACESSAR',
	`buttonLink` text,
	`bgColor` varchar(32) NOT NULL DEFAULT '#6d28d9',
	`buttonColor` varchar(32) NOT NULL DEFAULT '#7c3aed',
	`titleColor` varchar(32) NOT NULL DEFAULT '#ffffff',
	`descColor` varchar(32) NOT NULL DEFAULT '#e9d5ff',
	`isActive` int NOT NULL DEFAULT 1,
	`sortOrder` int NOT NULL DEFAULT 0,
	`openInNewTab` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `featureCards_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `scheduleAppointments` ADD `adminSeenConfirmedAt` timestamp;