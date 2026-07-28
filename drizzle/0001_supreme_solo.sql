CREATE TABLE `accessCodes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(64) NOT NULL,
	`type` enum('general','vip') NOT NULL DEFAULT 'vip',
	`status` enum('active','used','disabled') NOT NULL DEFAULT 'active',
	`clientName` text,
	`usedAt` timestamp,
	`usedBy` text,
	`maxUses` int DEFAULT 1,
	`currentUses` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `accessCodes_id` PRIMARY KEY(`id`),
	CONSTRAINT `accessCodes_code_unique` UNIQUE(`code`)
);
