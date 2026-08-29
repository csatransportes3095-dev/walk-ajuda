CREATE TABLE IF NOT EXISTS `h2ads_instance_ip_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `instanceId` int NOT NULL,
  `workerId` int NOT NULL,
  `observedIp` varchar(64) NOT NULL,
  `observedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `h2ads_ip_history_instance_time_idx` (`instanceId`,`observedAt`),
  KEY `h2ads_ip_history_worker_idx` (`workerId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
