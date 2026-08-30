CREATE TABLE IF NOT EXISTS `h2ads_order_links` (
  `id` int NOT NULL AUTO_INCREMENT,
  `instanceId` int NOT NULL,
  `registrationId` int NOT NULL,
  `subOrderIndex` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `h2ads_order_links_instance_unique` (`instanceId`),
  UNIQUE KEY `h2ads_order_links_order_unique` (`registrationId`,`subOrderIndex`),
  KEY `h2ads_order_links_order_idx` (`registrationId`,`subOrderIndex`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
