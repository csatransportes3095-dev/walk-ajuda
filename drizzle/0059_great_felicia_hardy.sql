CREATE TABLE `pixAccounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`label` varchar(128) NOT NULL DEFAULT 'PIX Principal',
	`pixKey` varchar(256) NOT NULL,
	`pixType` varchar(64) NOT NULL DEFAULT 'TELEFONE',
	`pixName` varchar(256) NOT NULL,
	`pixBank` varchar(128) NOT NULL DEFAULT '',
	`isActive` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pixAccounts_id` PRIMARY KEY(`id`)
);
