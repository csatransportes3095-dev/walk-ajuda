CREATE TABLE IF NOT EXISTS `h2ads_browser_workers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `workerKey` varchar(64) NOT NULL,
  `name` varchar(128) NOT NULL,
  `operatingSystem` enum('windows') NOT NULL DEFAULT 'windows',
  `status` enum('active','revoked') NOT NULL DEFAULT 'active',
  `capacity` int NOT NULL DEFAULT 1,
  `tokenHash` varchar(64) NOT NULL,
  `computerName` varchar(128) DEFAULT NULL,
  `agentVersion` varchar(32) DEFAULT NULL,
  `lastSeenAt` timestamp NULL DEFAULT NULL,
  `revokedAt` timestamp NULL DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `h2ads_browser_worker_key_uq` (`workerKey`),
  KEY `h2ads_browser_worker_status_idx` (`status`),
  KEY `h2ads_browser_worker_last_seen_idx` (`lastSeenAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `h2ads_worker_pairing_codes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `codeHash` varchar(64) NOT NULL,
  `requestedName` varchar(128) NOT NULL,
  `requestedCapacity` int NOT NULL DEFAULT 1,
  `expiresAt` timestamp NOT NULL,
  `usedAt` timestamp NULL DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `h2ads_worker_pairing_code_hash_uq` (`codeHash`),
  KEY `h2ads_worker_pairing_code_expires_idx` (`expiresAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `h2ads_instance_worker_assignments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `instanceId` int NOT NULL,
  `workerId` int NOT NULL,
  `profileState` enum('not_started','local_only','snapshot_ready','transferring','restore_failed') NOT NULL DEFAULT 'not_started',
  `profileVersion` int NOT NULL DEFAULT 0,
  `snapshotKey` varchar(512) DEFAULT NULL,
  `integrityHash` varchar(64) DEFAULT NULL,
  `snapshotSizeBytes` int DEFAULT NULL,
  `lastSnapshotAt` timestamp NULL DEFAULT NULL,
  `assignedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `h2ads_instance_worker_assignment_instance_uq` (`instanceId`),
  KEY `h2ads_instance_worker_assignment_worker_idx` (`workerId`),
  KEY `h2ads_instance_worker_assignment_profile_state_idx` (`profileState`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
