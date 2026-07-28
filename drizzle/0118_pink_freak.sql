CREATE TABLE `broadcastQueue` (
	`id` int AUTO_INCREMENT NOT NULL,
	`broadcastId` int NOT NULL,
	`recipientEmail` varchar(256) NOT NULL,
	`recipientPhone` varchar(32),
	`status` enum('pending','sent','failed') NOT NULL DEFAULT 'pending',
	`sentAt` timestamp,
	`error` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `broadcastQueue_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `broadcasts` MODIFY COLUMN `status` enum('draft','sending','sent','cancelled') NOT NULL DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE `broadcasts` ADD `emailsSent` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `broadcasts` ADD `emailsFailed` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `broadcasts` ADD `sendIntervalSeconds` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `broadcasts` ADD `scheduleCronTaskUid` varchar(65);--> statement-breakpoint
ALTER TABLE `customers` ADD `blocked` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `blockReason` varchar(512);--> statement-breakpoint
ALTER TABLE `customers` ADD `blockedAt` timestamp;