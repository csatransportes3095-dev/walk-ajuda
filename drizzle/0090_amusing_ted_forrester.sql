CREATE TABLE `homeButtons` (
	`id` int AUTO_INCREMENT NOT NULL,
	`text` varchar(128) NOT NULL DEFAULT 'NOVO BOTÃO',
	`subtitle` varchar(256) NOT NULL DEFAULT '',
	`url` varchar(512) NOT NULL DEFAULT '/sorteio',
	`waMsg` text,
	`icon` varchar(32) NOT NULL DEFAULT 'gift',
	`color` varchar(32) NOT NULL DEFAULT '#7c3aed',
	`textColor` varchar(32) NOT NULL DEFAULT '#ffffff',
	`subColor` varchar(32) NOT NULL DEFAULT 'rgba(255,255,255,0.7)',
	`font` varchar(64) NOT NULL DEFAULT '',
	`hover` varchar(16) NOT NULL DEFAULT 'scale',
	`isActive` int NOT NULL DEFAULT 1,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `homeButtons_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `internalStages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`icon` varchar(64) NOT NULL DEFAULT '📋',
	`color` varchar(32) NOT NULL DEFAULT '#6366f1',
	`sortOrder` int NOT NULL DEFAULT 0,
	`isActive` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `internalStages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orderStageHistory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`registrationId` int NOT NULL,
	`stageId` int NOT NULL,
	`setAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `orderStageHistory_id` PRIMARY KEY(`id`)
);
