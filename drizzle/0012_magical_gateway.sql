DROP TABLE `customerRegistrations`;--> statement-breakpoint
DROP TABLE `installmentPayments`;--> statement-breakpoint
ALTER TABLE `accessCodes` MODIFY COLUMN `type` enum('general','vip') NOT NULL DEFAULT 'vip';--> statement-breakpoint
ALTER TABLE `accessCodes` DROP COLUMN `linkedProductId`;--> statement-breakpoint
ALTER TABLE `accessCodes` DROP COLUMN `totalAmount`;--> statement-breakpoint
ALTER TABLE `accessCodes` DROP COLUMN `weeklyAmount`;--> statement-breakpoint
ALTER TABLE `accessCodes` DROP COLUMN `totalInstallments`;