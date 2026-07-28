CREATE TABLE `customFolderOrders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`folderId` int NOT NULL,
	`registrationId` int NOT NULL,
	`subOrderIndex` int NOT NULL DEFAULT 0,
	`movedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customFolderOrders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `customFolders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`icon` varchar(64) DEFAULT '📁',
	`color` varchar(32) DEFAULT '#8b5cf6',
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customFolders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `folderConfig` (
	`id` int AUTO_INCREMENT NOT NULL,
	`folderKey` varchar(32) NOT NULL,
	`name` varchar(128) NOT NULL,
	`icon` varchar(64) DEFAULT '📁',
	`color` varchar(32) DEFAULT '#8b5cf6',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `folderConfig_id` PRIMARY KEY(`id`),
	CONSTRAINT `folderConfig_folderKey_unique` UNIQUE(`folderKey`)
);
