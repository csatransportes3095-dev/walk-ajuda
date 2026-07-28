CREATE TABLE `accessCodePhones` (
	`id` int AUTO_INCREMENT NOT NULL,
	`codeId` int NOT NULL,
	`phone` varchar(32) NOT NULL,
	`accessedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `accessCodePhones_id` PRIMARY KEY(`id`)
);
