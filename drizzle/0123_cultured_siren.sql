CREATE TABLE `whatsappTemplates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(200) NOT NULL,
	`statusKey` varchar(100),
	`message` text NOT NULL,
	`imageUrl` text,
	`videoUrl` text,
	`mediaFileKey` varchar(500),
	`mediaFileUrl` text,
	`mediaType` enum('image','video'),
	`sortOrder` int NOT NULL DEFAULT 0,
	`isDefault` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `whatsappTemplates_id` PRIMARY KEY(`id`)
);
