ALTER TABLE `accessCodePhones` ADD `cartGroupId` varchar(64);--> statement-breakpoint
ALTER TABLE `accessCodePhones` ADD `cartTotal` decimal(10,2);--> statement-breakpoint
ALTER TABLE `accessCodePhones` ADD `cartCouponCode` varchar(64);--> statement-breakpoint
ALTER TABLE `accessCodePhones` ADD `cartCouponDiscount` decimal(10,2);--> statement-breakpoint
ALTER TABLE `accessCodePhones` ADD `cartItemIndex` int DEFAULT 0;