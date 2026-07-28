CREATE TABLE `customerLoginHistory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`phone` varchar(32) NOT NULL,
	`loginAt` timestamp NOT NULL DEFAULT (now()),
	`ipAddress` varchar(64),
	`userAgent` varchar(512),
	CONSTRAINT `customerLoginHistory_id` PRIMARY KEY(`id`)
);
