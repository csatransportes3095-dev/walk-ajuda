CREATE TABLE `referralHistory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`referrerPhone` varchar(32) NOT NULL,
	`referrerName` varchar(128),
	`referredCustomerId` int NOT NULL,
	`referredPhone` varchar(32) NOT NULL,
	`referredName` varchar(128),
	`orderId` int,
	`status` enum('pending','completed','cancelled') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `referralHistory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `referralStats` (
	`id` int AUTO_INCREMENT NOT NULL,
	`referrerPhone` varchar(32) NOT NULL,
	`referrerName` varchar(128),
	`totalReferred` int NOT NULL DEFAULT 0,
	`lastReferralAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `referralStats_id` PRIMARY KEY(`id`),
	CONSTRAINT `referralStats_referrerPhone_unique` UNIQUE(`referrerPhone`)
);
