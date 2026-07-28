ALTER TABLE `spreadsheetPasswords` ADD `passwordLocked` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `uploadSessions` ADD `jobStatus` varchar(16) DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `uploadSessions` ADD `jobUrl` varchar(1024);--> statement-breakpoint
ALTER TABLE `uploadSessions` ADD `jobError` varchar(512);