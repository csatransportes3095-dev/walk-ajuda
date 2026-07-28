CREATE TABLE `customerRegistrations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`codeId` int NOT NULL,
	`phone` varchar(32) NOT NULL,
	`fullName` varchar(128) NOT NULL,
	`email` varchar(320),
	`street` text,
	`city` varchar(128),
	`state` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customerRegistrations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `installmentPayments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`codeId` int NOT NULL,
	`registrationId` int NOT NULL,
	`weekNumber` int NOT NULL,
	`amount` int NOT NULL,
	`dueDate` timestamp,
	`status` enum('pending','submitted','approved','rejected') NOT NULL DEFAULT 'pending',
	`proofUrl` text,
	`proofKey` varchar(256),
	`adminNotes` text,
	`submittedAt` timestamp,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `installmentPayments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `accessCodes` MODIFY COLUMN `type` enum('general','vip','installment') NOT NULL DEFAULT 'vip';--> statement-breakpoint
ALTER TABLE `accessCodes` ADD `linkedProductId` int;--> statement-breakpoint
ALTER TABLE `accessCodes` ADD `totalAmount` int;--> statement-breakpoint
ALTER TABLE `accessCodes` ADD `weeklyAmount` int;--> statement-breakpoint
ALTER TABLE `accessCodes` ADD `totalInstallments` int;