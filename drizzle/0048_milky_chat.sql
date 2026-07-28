CREATE TABLE `hiddenSubOrders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`registrationId` int NOT NULL,
	`subOrderIndex` int NOT NULL,
	`hiddenAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `hiddenSubOrders_id` PRIMARY KEY(`id`)
);
