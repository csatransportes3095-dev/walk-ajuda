CREATE TABLE IF NOT EXISTS `h2ads_instance_browser_runs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `instanceId` int NOT NULL,
  `workerId` int NOT NULL,
  `state` enum('not_prepared','queued','preparing','proxy_verified','blocked','browser_open','closed') NOT NULL DEFAULT 'not_prepared',
  `observedIp` varchar(64) DEFAULT NULL,
  `lastErrorCategory` varchar(64) DEFAULT NULL,
  `preparedAt` timestamp NULL DEFAULT NULL,
  `lastChangedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `h2ads_browser_run_instance_uq` (`instanceId`),
  KEY `h2ads_browser_run_worker_idx` (`workerId`),
  KEY `h2ads_browser_run_state_idx` (`state`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `h2ads_worker_commands` (
  `id` int NOT NULL AUTO_INCREMENT,
  `workerId` int NOT NULL,
  `instanceId` int NOT NULL,
  `command` enum('prepare_browser') NOT NULL,
  `status` enum('queued','claimed','succeeded','failed','cancelled') NOT NULL DEFAULT 'queued',
  `errorCategory` varchar(64) DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `claimedAt` timestamp NULL DEFAULT NULL,
  `completedAt` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `h2ads_worker_command_worker_status_idx` (`workerId`,`status`),
  KEY `h2ads_worker_command_instance_status_idx` (`instanceId`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
