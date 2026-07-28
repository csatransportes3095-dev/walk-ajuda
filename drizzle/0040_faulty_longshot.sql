CREATE TABLE `orderStatusTypes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(64) NOT NULL,
	`label` varchar(128) NOT NULL,
	`color` varchar(64) NOT NULL DEFAULT 'text-gray-400',
	`bgColor` varchar(128) NOT NULL DEFAULT 'bg-gray-500/20 border-gray-500/40',
	`icon` varchar(32) NOT NULL DEFAULT 'Clock',
	`description` text,
	`sortOrder` int NOT NULL DEFAULT 0,
	`isSystem` int NOT NULL DEFAULT 0,
	`isActive` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orderStatusTypes_id` PRIMARY KEY(`id`),
	CONSTRAINT `orderStatusTypes_key_unique` UNIQUE(`key`)
);
