CREATE TABLE `uploadSessions` (
	`uploadId` varchar(64) NOT NULL,
	`registrationId` varchar(32) NOT NULL,
	`customerPhone` varchar(32) NOT NULL,
	`label` varchar(256) NOT NULL,
	`fromAdmin` varchar(4) NOT NULL DEFAULT '0',
	`mimeType` varchar(64) NOT NULL,
	`ext` varchar(16) NOT NULL,
	`contentType` varchar(64) NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`totalChunks` int NOT NULL,
	`receivedChunks` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `uploadSessions_uploadId` PRIMARY KEY(`uploadId`)
);
