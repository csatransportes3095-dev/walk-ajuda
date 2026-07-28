ALTER TABLE `accessCodePhones` ADD `refCode` varchar(64) DEFAULT null;--> statement-breakpoint
ALTER TABLE `accessCodePhones` ADD `refExpiresAt` bigint DEFAULT null;--> statement-breakpoint
ALTER TABLE `accessCodePhones` ADD `refOwnerName` varchar(128) DEFAULT null;