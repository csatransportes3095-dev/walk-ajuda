CREATE TABLE `coupons` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(64) NOT NULL,
	`discountType` enum('percentage','fixed') NOT NULL DEFAULT 'fixed',
	`discountValue` int NOT NULL,
	`status` enum('active','used','disabled') NOT NULL DEFAULT 'active',
	`maxUses` int DEFAULT 1,
	`currentUses` int DEFAULT 0,
	`expiresAt` timestamp,
	`usedBy` text,
	`usedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `coupons_id` PRIMARY KEY(`id`),
	CONSTRAINT `coupons_code_unique` UNIQUE(`code`)
);
