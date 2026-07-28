CREATE TABLE `orderCustomGroupMembers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` int NOT NULL,
	`registrationId` int NOT NULL,
	`addedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `orderCustomGroupMembers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orderCustomGroups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`color` varchar(32) NOT NULL DEFAULT 'red',
	`icon` varchar(10) DEFAULT '🔖',
	`position` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `orderCustomGroups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `orderCustomGroupMembers` ADD CONSTRAINT `orderCustomGroupMembers_groupId_orderCustomGroups_id_fk` FOREIGN KEY (`groupId`) REFERENCES `orderCustomGroups`(`id`) ON DELETE cascade ON UPDATE no action;