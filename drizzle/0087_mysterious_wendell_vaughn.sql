CREATE TABLE `homePageButtons` (
	`id` int AUTO_INCREMENT NOT NULL,
	`buttonNumber` int NOT NULL,
	`mainText` varchar(256) NOT NULL,
	`subText` varchar(512) NOT NULL,
	`buttonBgColor` varchar(32) NOT NULL DEFAULT '#800000',
	`mainTextColor` varchar(32) NOT NULL DEFAULT '#ffffff',
	`subTextColor` varchar(32) NOT NULL DEFAULT '#ffffff',
	`fontFamily` varchar(128) NOT NULL DEFAULT 'Rajdhani',
	`hoverEffect` varchar(64) NOT NULL DEFAULT 'zoom',
	`isActive` int NOT NULL DEFAULT 1,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `homePageButtons_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `orderStatusHistory` ADD `approval` varchar(16) DEFAULT 'approved' NOT NULL;