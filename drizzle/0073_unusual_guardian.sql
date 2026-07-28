CREATE TABLE `scheduleAppointments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`token` varchar(64) NOT NULL,
	`registrationId` int NOT NULL,
	`subOrderIndex` int NOT NULL DEFAULT 0,
	`customerPhone` varchar(32) NOT NULL,
	`customerName` varchar(128),
	`customerEmail` varchar(320),
	`serviceName` varchar(256),
	`slotId` int,
	`slotDate` varchar(16),
	`slotTime` varchar(8),
	`status` enum('pending','confirmed','cancelled') NOT NULL DEFAULT 'pending',
	`instructions` text,
	`sentByEmail` int NOT NULL DEFAULT 0,
	`confirmedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scheduleAppointments_id` PRIMARY KEY(`id`),
	CONSTRAINT `scheduleAppointments_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `scheduleConfig` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(256) NOT NULL DEFAULT 'Agende seu atendimento',
	`introMessage` text NOT NULL DEFAULT ('Seu pedido precisa ser agendado. Escolha abaixo a melhor data e horário disponível para o seu atendimento.'),
	`emailSubject` varchar(256) NOT NULL DEFAULT 'Agende seu atendimento - WALK AJUDA',
	`emailMessage` text NOT NULL DEFAULT ('Olá! Seu pedido precisa ser agendado. Clique no link abaixo para escolher a data e o horário do seu atendimento.'),
	`whatsappMessage` text NOT NULL DEFAULT ('Olá! Seu pedido na WALK AJUDA precisa ser agendado. Acesse o link para escolher a data e o horário do seu atendimento:'),
	`confirmationMessage` text NOT NULL DEFAULT ('Seu atendimento foi agendado com sucesso! Guarde a data e o horário escolhidos. O atendimento será feito pelo WhatsApp nesse horário.'),
	`noShowWarning` text NOT NULL DEFAULT ('ATENÇÃO: O atendimento será feito pelo WhatsApp no horário escolhido. Fique disponível no seu WhatsApp nesse horário. Se você não atender quando for chamado, será necessário reagendar.'),
	`accentColor` varchar(32) NOT NULL DEFAULT '#8b5cf6',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scheduleConfig_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scheduleSlots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slotDate` varchar(16) NOT NULL,
	`slotTime` varchar(8) NOT NULL,
	`capacity` int NOT NULL DEFAULT 1,
	`bookedCount` int NOT NULL DEFAULT 0,
	`status` enum('available','disabled') NOT NULL DEFAULT 'available',
	`note` varchar(256),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `scheduleSlots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scheduleTemplates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(256) NOT NULL,
	`serviceName` varchar(256) NOT NULL DEFAULT '',
	`instructions` text NOT NULL DEFAULT (''),
	`emailSubject` varchar(256),
	`emailMessage` text,
	`whatsappMessage` text,
	`isActive` int NOT NULL DEFAULT 1,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scheduleTemplates_id` PRIMARY KEY(`id`)
);
