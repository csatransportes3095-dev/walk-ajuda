CREATE TABLE `emailAccounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`emailAddress` varchar(320) NOT NULL,
	`type` enum('principal','membro') NOT NULL DEFAULT 'membro',
	`createdAt` bigint NOT NULL DEFAULT (DATE_FORMAT(NOW(3), '%Y%m%d%H%i%s%f')),
	`updatedAt` bigint NOT NULL DEFAULT (DATE_FORMAT(NOW(3), '%Y%m%d%H%i%s%f')),
	CONSTRAINT `emailAccounts_id` PRIMARY KEY (`id`),
	CONSTRAINT `emailAccounts_emailAddress_unique` UNIQUE(`emailAddress`)
);
