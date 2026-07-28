CREATE TABLE `orderCounter` (
	`id` int AUTO_INCREMENT NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `orderCounter_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `customers` ADD `customerNumber` int;--> statement-breakpoint
ALTER TABLE `orderStatusHistory` ADD `orderNumber` int;