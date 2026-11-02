CREATE TABLE IF NOT EXISTS `transport_records` (
  `id` int NOT NULL AUTO_INCREMENT,
  `cnpj` varchar(14) NOT NULL,
  `name` varchar(255) NOT NULL,
  `type` varchar(24) NOT NULL DEFAULT 'outros',
  `uf` varchar(2) NOT NULL DEFAULT 'ND',
  `city` varchar(160) NOT NULL DEFAULT '',
  `cnae` varchar(32) NOT NULL DEFAULT '',
  `source` text,
  `notes` text,
  `is_used` int NOT NULL DEFAULT 0,
  `checksum_ok` int NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `transport_records_cnpj_unique` (`cnpj`),
  KEY `transport_records_uf_city_idx` (`uf`,`city`),
  KEY `transport_records_type_idx` (`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
