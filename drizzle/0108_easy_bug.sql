ALTER TABLE `productOptions` ADD `commissionValue` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `referralHistory` ADD `commissionValue` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `referralHistory` ADD `commissionPaid` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `referralHistory` ADD `serviceName` varchar(256);--> statement-breakpoint
ALTER TABLE `referralHistory` ADD `serviceOption` varchar(256);