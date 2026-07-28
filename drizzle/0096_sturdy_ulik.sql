CREATE TABLE `spreadsheetEarnings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`date` varchar(10) NOT NULL,
	`uber` decimal(10,2) DEFAULT '0',
	`ninetynine` decimal(10,2) DEFAULT '0',
	`indrive` decimal(10,2) DEFAULT '0',
	`deliveries` decimal(10,2) DEFAULT '0',
	`tips` decimal(10,2) DEFAULT '0',
	`otherEarnings` decimal(10,2) DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `spreadsheetEarnings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `spreadsheetExpenses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`date` varchar(10) NOT NULL,
	`fuel` decimal(10,2) DEFAULT '0',
	`carRental` decimal(10,2) DEFAULT '0',
	`maintenance` decimal(10,2) DEFAULT '0',
	`oilChange` decimal(10,2) DEFAULT '0',
	`washing` decimal(10,2) DEFAULT '0',
	`insurance` decimal(10,2) DEFAULT '0',
	`internetPhone` decimal(10,2) DEFAULT '0',
	`food` decimal(10,2) DEFAULT '0',
	`parking` decimal(10,2) DEFAULT '0',
	`tolls` decimal(10,2) DEFAULT '0',
	`financing` decimal(10,2) DEFAULT '0',
	`fines` decimal(10,2) DEFAULT '0',
	`accessories` decimal(10,2) DEFAULT '0',
	`otherExpenses` decimal(10,2) DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `spreadsheetExpenses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `spreadsheetGoals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`month` varchar(7) NOT NULL,
	`dailyGoal` decimal(10,2) DEFAULT '0',
	`weeklyGoal` decimal(10,2) DEFAULT '0',
	`monthlyGoal` decimal(10,2) DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `spreadsheetGoals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `spreadsheetLicenses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`type` enum('free','premium') NOT NULL DEFAULT 'free',
	`status` enum('active','expired','cancelled') NOT NULL DEFAULT 'active',
	`expiresAt` timestamp,
	`blockedByAdmin` int NOT NULL DEFAULT 0,
	`lastAccessedAt` timestamp,
	`accessCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `spreadsheetLicenses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `spreadsheetOperational` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`date` varchar(10) NOT NULL,
	`kmInitial` decimal(10,2) DEFAULT '0',
	`kmFinal` decimal(10,2) DEFAULT '0',
	`timeInitial` varchar(5),
	`timeFinal` varchar(5),
	`rideCount` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `spreadsheetOperational_id` PRIMARY KEY(`id`)
);
