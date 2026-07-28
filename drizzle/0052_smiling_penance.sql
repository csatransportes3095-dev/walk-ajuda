CREATE TABLE `docRequests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`registrationId` int NOT NULL,
	`customerPhone` varchar(32) NOT NULL,
	`message` text NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'pending',
	`answeredFileId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `docRequests_id` PRIMARY KEY(`id`)
);
