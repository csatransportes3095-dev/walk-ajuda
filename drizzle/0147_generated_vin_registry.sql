-- Registro aditivo; não altera o gerador, seus dados nem outras tabelas.
-- Chave primária evita duplicação mesmo com acessos simultâneos.
CREATE TABLE IF NOT EXISTS `h2_generated_vin_registry` (
  `vin` CHAR(17) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`vin`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
