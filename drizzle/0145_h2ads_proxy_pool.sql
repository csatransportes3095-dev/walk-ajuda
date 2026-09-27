CREATE TABLE IF NOT EXISTS `h2ads_proxy_pool` (
  `id` int NOT NULL AUTO_INCREMENT,
  `fingerprint` char(64) NOT NULL,
  `cipherVersion` varchar(16) NOT NULL DEFAULT 'v1',
  `encryptedPayload` text NOT NULL,
  `protocol` varchar(16) NOT NULL DEFAULT 'http',
  `status` enum('available','assigned','used','failed','disabled') NOT NULL DEFAULT 'available',
  `assignedInstanceId` int NULL,
  `lastErrorCategory` varchar(64) NULL,
  `assignedAt` timestamp NULL,
  `consumedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `h2ads_proxy_pool_fingerprint_uq` (`fingerprint`),
  KEY `h2ads_proxy_pool_status_idx` (`status`, `id`),
  KEY `h2ads_proxy_pool_instance_idx` (`assignedInstanceId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;