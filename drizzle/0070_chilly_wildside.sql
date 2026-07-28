CREATE TABLE `faqConfig` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(256) NOT NULL DEFAULT 'Tire suas dúvidas antes de finalizar seu pedido',
	`subtitle` varchar(512),
	`buttonLabel` varchar(128) NOT NULL DEFAULT 'Tire suas dúvidas',
	`buttonColor` varchar(32) NOT NULL DEFAULT '#8b5cf6',
	`buttonTextColor` varchar(32) NOT NULL DEFAULT '#ffffff',
	`headerColor` varchar(32) NOT NULL DEFAULT '#1e1b4b',
	`headerTextColor` varchar(32) NOT NULL DEFAULT '#ffffff',
	`accentColor` varchar(32) NOT NULL DEFAULT '#8b5cf6',
	`enabled` int NOT NULL DEFAULT 1,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `faqConfig_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `faqItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`order` int NOT NULL DEFAULT 0,
	`enabled` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `faqItems_id` PRIMARY KEY(`id`)
);
