CREATE TABLE `zohoOAuthConfigs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`zohoOrgId` varchar(64) NOT NULL,
	`zohoClientId` varchar(256) NOT NULL,
	`zohoClientSecret` varchar(256) NOT NULL,
	`zohoRefreshToken` varchar(512) NOT NULL,
	`isActive` int NOT NULL DEFAULT 1,
	`status` enum('active','inactive','error') NOT NULL DEFAULT 'inactive',
	`lastError` text,
	`lastTestAt` bigint,
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `zohoOAuthConfigs_id` PRIMARY KEY (`id`)
);
