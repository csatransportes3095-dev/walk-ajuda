CREATE TABLE `financialSales` (
	`id` int AUTO_INCREMENT NOT NULL,
	`registrationId` int,
	`customerName` varchar(256) NOT NULL DEFAULT '',
	`customerPhone` varchar(32) NOT NULL DEFAULT '',
	`productName` varchar(256) NOT NULL DEFAULT '',
	`productOption` varchar(256) NOT NULL DEFAULT '',
	`saleValue` int NOT NULL DEFAULT 0,
	`costValue` int NOT NULL DEFAULT 0,
	`paymentMethod` varchar(64) NOT NULL DEFAULT 'pix',
	`status` varchar(32) NOT NULL DEFAULT 'pendente',
	`saleDate` bigint NOT NULL,
	`receivedDate` bigint,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `financialSales_id` PRIMARY KEY(`id`)
);
