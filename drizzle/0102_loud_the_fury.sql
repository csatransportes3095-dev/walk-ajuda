CREATE TABLE `adminMediaFiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(512) NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`url` text NOT NULL,
	`mimeType` varchar(64) NOT NULL,
	`fileSize` bigint NOT NULL DEFAULT 0,
	`uploadedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `adminMediaFiles_id` PRIMARY KEY(`id`)
);
