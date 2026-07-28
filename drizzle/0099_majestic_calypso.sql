ALTER TABLE `spreadsheetClients` DROP INDEX `spreadsheetClients_email_unique`;--> statement-breakpoint
ALTER TABLE `spreadsheetClients` MODIFY COLUMN `phone` varchar(32) NOT NULL;--> statement-breakpoint
ALTER TABLE `spreadsheetLoginAudit` ADD `phone` varchar(32);--> statement-breakpoint
ALTER TABLE `spreadsheetOperational` ADD `ridesUber` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `spreadsheetOperational` ADD `rides99` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `spreadsheetOperational` ADD `ridesIndrive` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `spreadsheetOperational` ADD `ridesParticular` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `spreadsheetOperational` ADD `ridesDeliveries` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `spreadsheetPasswords` ADD `pendingApproval` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `spreadsheetPasswords` ADD `createdByClient` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `spreadsheetPasswords` ADD `clientCreatedAt` timestamp;--> statement-breakpoint
ALTER TABLE `spreadsheetClients` ADD CONSTRAINT `spreadsheetClients_phone_unique` UNIQUE(`phone`);--> statement-breakpoint
ALTER TABLE `spreadsheetClients` DROP COLUMN `email`;--> statement-breakpoint
ALTER TABLE `spreadsheetClients` DROP COLUMN `passwordHash`;--> statement-breakpoint
ALTER TABLE `spreadsheetLoginAudit` DROP COLUMN `email`;