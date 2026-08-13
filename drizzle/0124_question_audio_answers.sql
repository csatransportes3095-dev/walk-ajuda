-- Migration aditiva exclusiva para respostas em áudio de perguntas de produto.
-- Não modifica dados existentes, documentos, pedidos anteriores ou outros módulos.

ALTER TABLE `productQuestions`
  MODIFY COLUMN `fieldType` enum('text','select','textarea','audio') NOT NULL DEFAULT 'text';
--> statement-breakpoint
ALTER TABLE `productQuestions` ADD COLUMN `helpText` text;
--> statement-breakpoint
ALTER TABLE `productQuestions` ADD COLUMN `audioMinDurationSeconds` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `productQuestions` ADD COLUMN `audioMaxDurationSeconds` int NOT NULL DEFAULT 120;
--> statement-breakpoint
ALTER TABLE `productQuestions` ADD COLUMN `allowAudioRerecord` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `productQuestions` ADD COLUMN `allowAudioFileUpload` int NOT NULL DEFAULT 1;
--> statement-breakpoint

CREATE TABLE `questionAudioDrafts` (
  `id` varchar(64) NOT NULL,
  `flowId` varchar(64) NOT NULL,
  `customerPhone` varchar(32) NOT NULL,
  `productId` int NOT NULL,
  `optionId` int NOT NULL,
  `questionId` int NOT NULL,
  `storageKey` varchar(512) NOT NULL,
  `audioUrl` text NOT NULL,
  `mimeType` varchar(128) NOT NULL,
  `fileSize` int NOT NULL,
  `durationSeconds` int NOT NULL,
  `expiresAt` timestamp NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_question_audio_draft_flow` (`flowId`),
  KEY `idx_question_audio_draft_question` (`questionId`),
  KEY `idx_question_audio_draft_expiry` (`expiresAt`)
);
--> statement-breakpoint

CREATE TABLE `orderQuestionAudioAnswers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `registrationId` int NOT NULL,
  `orderStatusId` int NOT NULL,
  `customerPhone` varchar(32) NOT NULL,
  `productId` int NOT NULL,
  `optionId` int NOT NULL,
  `questionId` int NOT NULL,
  `storageKey` varchar(512) NOT NULL,
  `audioUrl` text NOT NULL,
  `mimeType` varchar(128) NOT NULL,
  `fileSize` int NOT NULL,
  `durationSeconds` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_order_question_audio` (`orderStatusId`, `questionId`),
  KEY `idx_order_question_audio_registration` (`registrationId`),
  KEY `idx_order_question_audio_question` (`questionId`)
);
