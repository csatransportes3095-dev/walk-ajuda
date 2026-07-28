CREATE TABLE `pinBlocks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`phone` varchar(32) NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`blocked` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pinBlocks_id` PRIMARY KEY(`id`),
	CONSTRAINT `pinBlocks_phone_unique` UNIQUE(`phone`)
);
