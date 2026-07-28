ALTER TABLE `accessCodePhones` ADD `thirdPartyName` varchar(128);--> statement-breakpoint
ALTER TABLE `accessCodePhones` ADD `resellerDiscountApplied` decimal(10,2);--> statement-breakpoint
ALTER TABLE `adCampaigns` ADD `targetPages` varchar(256) DEFAULT 'gastos';--> statement-breakpoint
ALTER TABLE `customers` ADD `isReseller` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `resellerDiscountType` enum('percent','fixed') DEFAULT 'percent';--> statement-breakpoint
ALTER TABLE `customers` ADD `resellerDiscountValue` decimal(10,2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE `infoBanners` ADD `targetPages` varchar(128) DEFAULT 'gastos' NOT NULL;--> statement-breakpoint
ALTER TABLE `orderStatusHistory` ADD `pricePaid` varchar(64);