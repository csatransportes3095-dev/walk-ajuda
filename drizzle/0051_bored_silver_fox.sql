CREATE TABLE `customerPins` (
	`id` int AUTO_INCREMENT NOT NULL,
	`phone` varchar(32) NOT NULL,
	`pin` varchar(4),
	`firstAccess` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customerPins_id` PRIMARY KEY(`id`),
	CONSTRAINT `customerPins_phone_unique` UNIQUE(`phone`)
);
