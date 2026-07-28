CREATE TABLE `orderLoginData` (
	`id` int AUTO_INCREMENT NOT NULL,
	`registrationId` int NOT NULL,
	`customerPhone` varchar(32) NOT NULL,
	`loginEmail` varchar(320),
	`loginPassword` varchar(256),
	`authCode` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orderLoginData_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `accessCodePhones` ADD `orderSource` varchar(16) DEFAULT 'auto' NOT NULL;