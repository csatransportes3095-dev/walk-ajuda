CREATE TABLE IF NOT EXISTS `h2ads_worker_browser_commands` (
  `id` int NOT NULL AUTO_INCREMENT,
  `workerId` int NOT NULL,
  `instanceId` int NOT NULL,
  `command` enum('launch_browser','close_browser') NOT NULL,
  `status` enum('queued','claimed','succeeded','failed','cancelled') NOT NULL DEFAULT 'queued',
  `errorCategory` varchar(64) DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `claimedAt` timestamp NULL DEFAULT NULL,
  `completedAt` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `h2ads_browser_command_worker_status_idx` (`workerId`,`status`),
  KEY `h2ads_browser_command_instance_status_idx` (`instanceId`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
