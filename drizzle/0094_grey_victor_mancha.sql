CREATE TABLE `referralReports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reporterPhone` varchar(32) NOT NULL,
	`reportedCustomerId` int NOT NULL,
	`reportedPhone` varchar(32) NOT NULL,
	`reportedName` varchar(128),
	`reason` text NOT NULL,
	`status` enum('pending','reviewed','resolved') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `referralReports_id` PRIMARY KEY(`id`)
);
