CREATE TABLE IF NOT EXISTS `h2ads_groups` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(128) NOT NULL,
  `description` text,
  `status` enum('active','archived') NOT NULL DEFAULT 'active',
  `sortOrder` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `h2ads_groups_status_idx` (`status`),
  KEY `h2ads_groups_sort_idx` (`sortOrder`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `h2ads_instances` (
  `id` int NOT NULL AUTO_INCREMENT,
  `groupId` int NOT NULL,
  `name` varchar(128) NOT NULL,
  `status` enum('draft','paused','archived') NOT NULL DEFAULT 'draft',
  `notes` text,
  `sortOrder` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `h2ads_instances_group_idx` (`groupId`),
  KEY `h2ads_instances_status_idx` (`status`),
  KEY `h2ads_instances_group_sort_idx` (`groupId`,`sortOrder`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
