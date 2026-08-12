-- Cadastro único global e permissões por rota.
-- Esta migração não exclui, mescla ou altera manualmente nenhum cliente.
-- O servidor também executa a versão compatível desta preparação antes de aceitar acessos.

ALTER TABLE `customers` ADD COLUMN IF NOT EXISTS `normalizedPhone` varchar(16);
ALTER TABLE `customers` ADD COLUMN IF NOT EXISTS `normalizedCpf` varchar(11);
ALTER TABLE `customers` ADD COLUMN IF NOT EXISTS `normalizedEmail` varchar(320);

CREATE TABLE IF NOT EXISTS `customerRoutePermissions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `customerId` int NOT NULL,
  `route` varchar(32) NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'approved',
  `grantedBy` varchar(100),
  `grantedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `customerRoutePermissions_id` PRIMARY KEY(`id`),
  CONSTRAINT `customer_route_permission_unique` UNIQUE(`customerId`, `route`)
);

CREATE TABLE IF NOT EXISTS `customerAccessRequests` (
  `id` int AUTO_INCREMENT NOT NULL,
  `customerId` int NOT NULL,
  `route` varchar(32) NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'pending',
  `pendingKey` tinyint,
  `requestedAt` timestamp NULL,
  `analyzedAt` timestamp NULL,
  `analyzedBy` varchar(100),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `customerAccessRequests_id` PRIMARY KEY(`id`),
  CONSTRAINT `customer_access_request_pending_unique` UNIQUE(`customerId`, `route`, `pendingKey`)
);

CREATE INDEX `customers_normalized_email_index` ON `customers` (`normalizedEmail`);
