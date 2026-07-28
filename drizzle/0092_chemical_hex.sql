CREATE TABLE `referrerBypassCodes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(64) NOT NULL,
	`status` enum('active','used','disabled') NOT NULL DEFAULT 'active',
	`createdBy` int NOT NULL,
	`usedBy` varchar(32),
	`usedAt` timestamp,
	`expiresAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `referrerBypassCodes_id` PRIMARY KEY(`id`),
	CONSTRAINT `referrerBypassCodes_code_unique` UNIQUE(`code`)
);
