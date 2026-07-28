ALTER TABLE `customers` ADD `fixedPassword` varchar(64);--> statement-breakpoint
ALTER TABLE `customers` ADD `fixedPasswordActive` int DEFAULT 0 NOT NULL;