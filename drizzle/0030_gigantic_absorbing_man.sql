CREATE TABLE `orderFiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`registrationId` int NOT NULL,
	`customerPhone` varchar(32) NOT NULL,
	`label` varchar(256) NOT NULL,
	`fileUrl` text NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`mimeType` varchar(128) NOT NULL DEFAULT 'image/jpeg',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `orderFiles_id` PRIMARY KEY(`id`)
);
