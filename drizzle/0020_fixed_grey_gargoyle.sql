CREATE TABLE `raffleEntries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`raffleId` int NOT NULL,
	`number` int NOT NULL,
	`customerName` varchar(128) NOT NULL,
	`customerPhone` varchar(32) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `raffleEntries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `raffles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(256) NOT NULL,
	`description` text,
	`status` enum('open','closed','drawn') NOT NULL DEFAULT 'open',
	`winnerNumber` int,
	`winnerName` varchar(128),
	`winnerPhone` varchar(32),
	`drawnAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `raffles_id` PRIMARY KEY(`id`)
);
