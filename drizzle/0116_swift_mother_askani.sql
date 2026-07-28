CREATE TABLE `consultaForms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(128) NOT NULL,
	`icon` varchar(64) DEFAULT 'Search',
	`type` enum('consultation','link') NOT NULL DEFAULT 'consultation',
	`redirectUrl` varchar(512) DEFAULT '',
	`fields` text DEFAULT ('[]'),
	`isActive` int NOT NULL DEFAULT 1,
	`isBuiltin` int NOT NULL DEFAULT 0,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `consultaForms_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `consultaRequests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`formId` int NOT NULL,
	`formTitle` varchar(128) NOT NULL,
	`customerPhone` varchar(32) NOT NULL,
	`customerName` varchar(128) DEFAULT '',
	`customerEmail` varchar(256) DEFAULT '',
	`customerPhoto` varchar(512) DEFAULT '',
	`data` text NOT NULL DEFAULT ('{}'),
	`status` enum('pending','answered') NOT NULL DEFAULT 'pending',
	`adminResponse` text DEFAULT (''),
	`respondedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `consultaRequests_id` PRIMARY KEY(`id`)
);
