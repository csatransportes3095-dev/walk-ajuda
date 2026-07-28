CREATE TABLE `loanClients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(150) NOT NULL,
	`cpf` varchar(14),
	`phone` varchar(20),
	`status` enum('ativo','bloqueado','inadimplente') NOT NULL DEFAULT 'ativo',
	`profileSlug` varchar(30) NOT NULL DEFAULT 'bronze',
	`creditLimit` decimal(10,2) NOT NULL DEFAULT '500.00',
	`interestRate` decimal(5,2) NOT NULL DEFAULT '5.00',
	`maxDays` int NOT NULL DEFAULT 30,
	`maxDaysSemanal` int NOT NULL DEFAULT 60,
	`maxDaysQuinzenal` int NOT NULL DEFAULT 60,
	`maxDaysMensal` int NOT NULL DEFAULT 90,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `loanClients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `loanProfiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(50) NOT NULL,
	`slug` varchar(30) NOT NULL,
	`creditLimit` decimal(10,2) NOT NULL DEFAULT '500.00',
	`interestRate` decimal(5,2) NOT NULL DEFAULT '5.00',
	`maxDays` int NOT NULL DEFAULT 30,
	`maxDaysSemanal` int NOT NULL DEFAULT 60,
	`maxDaysQuinzenal` int NOT NULL DEFAULT 60,
	`maxDaysMensal` int NOT NULL DEFAULT 90,
	`isActive` int NOT NULL DEFAULT 1,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `loanProfiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `loanProfiles_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `loans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`clientId` int NOT NULL,
	`amount` decimal(10,2) NOT NULL,
	`interestRate` decimal(5,2) NOT NULL,
	`days` int NOT NULL,
	`interestAmount` decimal(10,2) NOT NULL,
	`totalAmount` decimal(10,2) NOT NULL,
	`releaseDate` varchar(10) NOT NULL,
	`dueDate` varchar(10) NOT NULL,
	`status` enum('aguardando_pagamento','em_analise','pago','cancelado') NOT NULL DEFAULT 'aguardando_pagamento',
	`paidAt` timestamp,
	`paidBy` varchar(100),
	`refusedReason` text,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `loans_id` PRIMARY KEY(`id`)
);
