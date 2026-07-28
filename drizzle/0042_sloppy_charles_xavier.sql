CREATE TABLE `infoBanners` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(256) NOT NULL,
	`content` text NOT NULL,
	`bgColor` varchar(32) NOT NULL DEFAULT '#1e3a5f',
	`textColor` varchar(32) NOT NULL DEFAULT '#ffffff',
	`sortOrder` int NOT NULL DEFAULT 0,
	`isActive` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `infoBanners_id` PRIMARY KEY(`id`)
);
