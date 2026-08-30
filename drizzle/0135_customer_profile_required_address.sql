-- Campos de endereço do perfil obrigatório. Todos ficam NULL para preservar
-- integralmente os clientes existentes; eles apenas passam a completar o que falta.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS zipCode varchar(10) NULL;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS addressLine varchar(255) NULL;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS neighborhood varchar(128) NULL;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS addressNumber varchar(32) NULL;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS addressComplement varchar(128) NULL;

-- O telefone continua NOT NULL + UNIQUE e não é alterado por esta migração.

-- Vínculo interno estável para autenticação/sessões. Não substitui nem autoriza
-- alteração do telefone do cliente.
ALTER TABLE customerPasswords ADD COLUMN IF NOT EXISTS customerId int NULL;
ALTER TABLE customerPasswordSessions ADD COLUMN IF NOT EXISTS customerId int NULL;

CREATE TABLE IF NOT EXISTS customerIdentityAliases (
  id int AUTO_INCREMENT PRIMARY KEY,
  customerId int NOT NULL,
  identityType varchar(16) NOT NULL,
  identityValue varchar(320) NOT NULL,
  createdAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY customer_identity_alias_unique (identityType, identityValue),
  KEY customer_identity_alias_customer (customerId)
);
