ALTER TABLE `accessCodePhones` ADD `deletedAt` timestamp;--> statement-breakpoint
ALTER TABLE `accessCodePhones` ADD `deletedReason` varchar(256);--> statement-breakpoint
ALTER TABLE `customers` ADD `deletedAt` timestamp;--> statement-breakpoint
ALTER TABLE `customers` ADD `deletedReason` varchar(256);