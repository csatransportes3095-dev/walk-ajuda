CREATE TABLE `fixedFolderOrders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`folderKey` varchar(32) NOT NULL,
	`registrationId` int NOT NULL,
	`subOrderIndex` int NOT NULL DEFAULT 0,
	`movedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fixedFolderOrders_id` PRIMARY KEY(`id`)
);
