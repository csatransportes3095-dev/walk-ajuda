ALTER TABLE `systemBackups`
  ADD COLUMN IF NOT EXISTS `driveFileId` varchar(256) NULL,
  ADD COLUMN IF NOT EXISTS `driveStatus` enum('not_configured','queued','uploading','completed','failed') NOT NULL DEFAULT 'not_configured',
  ADD COLUMN IF NOT EXISTS `driveError` text NULL,
  ADD COLUMN IF NOT EXISTS `driveUploadedAt` timestamp NULL;
