CREATE TABLE `protectedPhotos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(256) NOT NULL DEFAULT '📸 Foto protegida',
	`message` text NOT NULL DEFAULT ('Para visualizar a foto, finalize seu cadastro e confirme seus dados.

✅ O acesso será registrado automaticamente.'),
	`imageUrl` text NOT NULL,
	`imageKey` varchar(512) NOT NULL,
	`isActive` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `protectedPhotos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trackingAnswers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`customerId` int,
	`questionId` int NOT NULL,
	`questionText` varchar(512) NOT NULL DEFAULT '',
	`answer` varchar(256) NOT NULL,
	`answeredAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `trackingAnswers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trackingQuestionAssignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`questionId` int NOT NULL,
	`questionText` varchar(512) NOT NULL DEFAULT '',
	`questionOptions` text NOT NULL DEFAULT ('[]'),
	`sentAt` timestamp NOT NULL DEFAULT (now()),
	`answeredAt` timestamp,
	`answer` varchar(256),
	CONSTRAINT `trackingQuestionAssignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trackingQuestions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`text` varchar(512) NOT NULL,
	`options` text NOT NULL DEFAULT ('[]'),
	`isActive` int NOT NULL DEFAULT 1,
	`showOnce` int NOT NULL DEFAULT 1,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `trackingQuestions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `accessCodePhones` MODIFY COLUMN `refCode` varchar(64);--> statement-breakpoint
ALTER TABLE `accessCodePhones` MODIFY COLUMN `refExpiresAt` bigint;--> statement-breakpoint
ALTER TABLE `accessCodePhones` MODIFY COLUMN `refOwnerName` varchar(128);--> statement-breakpoint
ALTER TABLE `customers` ADD `adminNotes` text;