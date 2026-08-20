ALTER TABLE `productQuestions` ADD COLUMN `questionPresentation` varchar(16) NOT NULL DEFAULT 'text';
ALTER TABLE `productQuestions` ADD COLUMN `questionAudioUrl` text NULL;
ALTER TABLE `productQuestions` ADD COLUMN `questionAudioStorageKey` varchar(512) NULL;
ALTER TABLE `productQuestions` ADD COLUMN `showQuestionTextWithAudio` int NOT NULL DEFAULT 0;
