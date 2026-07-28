CREATE TABLE `warrantyTiers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`optionId` int NOT NULL,
	`warrantyType` varchar(32) NOT NULL DEFAULT 'corridas',
	`warrantyValue` int NOT NULL DEFAULT 0,
	`warrantyLabel` varchar(128) DEFAULT '',
	`price` varchar(64) NOT NULL,
	`originalPrice` varchar(64) DEFAULT '',
	`sortOrder` int NOT NULL DEFAULT 0,
	`isActive` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `warrantyTiers_id` PRIMARY KEY(`id`)
);
