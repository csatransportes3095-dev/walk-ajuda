CREATE TABLE IF NOT EXISTS `systemBackups` (
  `id` varchar(64) NOT NULL,
  `status` enum('queued','running','completed','failed') NOT NULL DEFAULT 'queued',
  `stage` varchar(32) NOT NULL DEFAULT 'queued',
  `progress` int NOT NULL DEFAULT 0,
  `artifactKey` varchar(512),
  `fileSize` bigint,
  `archiveSha256` varchar(64),
  `manifestJson` text,
  `errorMessage` text,
  `initiatedBy` varchar(128),
  `startedAt` timestamp NULL,
  `completedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `systemBackups_status_idx` (`status`),
  KEY `systemBackups_created_idx` (`createdAt`)
);
