CREATE TABLE IF NOT EXISTS `adminAuthenticatorEntries` (
  `id` int NOT NULL AUTO_INCREMENT,
  `label` varchar(128) NOT NULL,
  `issuer` varchar(128) NULL,
  `secretCiphertext` text NOT NULL,
  `secretIv` varchar(64) NOT NULL,
  `secretTag` varchar(64) NOT NULL,
  `keyVersion` varchar(16) NOT NULL DEFAULT 'v1',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `lastUsedAt` timestamp NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `adminAuthenticatorAudit` (
  `id` int NOT NULL AUTO_INCREMENT,
  `entryId` int NULL,
  `action` varchar(32) NOT NULL,
  `adminUsername` varchar(128) NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `adminAuthenticatorAudit_entryId_createdAt_idx` (`entryId`, `createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
