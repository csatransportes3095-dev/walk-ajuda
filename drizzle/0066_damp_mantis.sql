CREATE TABLE `photoAccessLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`phone` varchar(32) NOT NULL,
	`photoId` int NOT NULL,
	`accessedAt` timestamp NOT NULL DEFAULT (now()),
	`ip` varchar(64),
	CONSTRAINT `photoAccessLogs_id` PRIMARY KEY(`id`)
);
