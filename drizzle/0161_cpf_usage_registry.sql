-- Permanent administrative usage registry. Existing customer CPFs are not imported.
CREATE TABLE IF NOT EXISTS cpf_usage_registry (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  normalizedCpf CHAR(11) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  registrationId INT NULL,
  subOrderIndex INT NOT NULL DEFAULT 0,
  orderRootId INT NULL,
  customerId INT NULL,
  customerName VARCHAR(128) NULL,
  customerNumber INT NULL,
  orderNumber INT NULL,
  note VARCHAR(1000) NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cpf_usage_normalized (normalizedCpf),
  KEY idx_cpf_usage_order (registrationId, orderRootId),
  KEY idx_cpf_usage_customer (customerId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
