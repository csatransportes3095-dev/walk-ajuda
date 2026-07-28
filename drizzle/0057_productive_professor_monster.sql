CREATE TABLE `blockedAccessAttempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`phone` varchar(32) NOT NULL,
	`action` varchar(64) NOT NULL,
	`ip` varchar(64),
	`reason` varchar(256),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `blockedAccessAttempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `broadcasts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(256) NOT NULL,
	`messageType` enum('text','link','banner','group_invite','promo') NOT NULL DEFAULT 'text',
	`message` text NOT NULL,
	`linkUrl` text,
	`linkLabel` varchar(128),
	`imageUrl` text,
	`targetType` enum('all','selected') NOT NULL DEFAULT 'all',
	`targetPhones` text,
	`totalRecipients` int NOT NULL DEFAULT 0,
	`status` enum('draft','sent') NOT NULL DEFAULT 'draft',
	`sentAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `broadcasts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ipAccessLog` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ip` varchar(64) NOT NULL,
	`action` varchar(64) NOT NULL,
	`customerPhone` varchar(32),
	`customerName` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ipAccessLog_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ipBlocklist` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ip` varchar(64) NOT NULL,
	`reason` varchar(512),
	`blockedBy` varchar(64) NOT NULL DEFAULT 'admin',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ipBlocklist_id` PRIMARY KEY(`id`),
	CONSTRAINT `ipBlocklist_ip_unique` UNIQUE(`ip`)
);
--> statement-breakpoint
CREATE TABLE `vpnAttempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ip` varchar(64) NOT NULL,
	`isp` varchar(256),
	`org` varchar(256),
	`country` varchar(64),
	`detectionType` varchar(32) NOT NULL DEFAULT 'vpn',
	`customerPhone` varchar(32),
	`customerName` varchar(128),
	`userAgent` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `vpnAttempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `raffles` ADD `maxNumbersPerPerson` int DEFAULT 1 NOT NULL;