CREATE TABLE `chatMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`chatId` int NOT NULL,
	`senderPhone` varchar(32) NOT NULL,
	`message` text NOT NULL,
	`readByPhones` text NOT NULL DEFAULT ('[]'),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chatMessages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chatNotifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`phone` varchar(32) NOT NULL,
	`chatId` int NOT NULL,
	`unreadCount` int NOT NULL DEFAULT 1,
	`lastMessagePreview` text,
	`lastMessageSenderPhone` varchar(32),
	`emailSent` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `chatNotifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `spreadsheetChats` (
	`id` int AUTO_INCREMENT NOT NULL,
	`phone` varchar(32) NOT NULL,
	`participantPhones` text NOT NULL,
	`isGroup` int NOT NULL DEFAULT 0,
	`groupName` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `spreadsheetChats_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `spreadsheetOnlineStatus` (
	`id` int AUTO_INCREMENT NOT NULL,
	`phone` varchar(32) NOT NULL,
	`isOnline` int NOT NULL DEFAULT 0,
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `spreadsheetOnlineStatus_id` PRIMARY KEY(`id`),
	CONSTRAINT `spreadsheetOnlineStatus_phone_unique` UNIQUE(`phone`)
);
--> statement-breakpoint
ALTER TABLE `optionDocuments` ADD `exampleText` text;