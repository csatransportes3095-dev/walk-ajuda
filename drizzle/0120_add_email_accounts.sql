-- Tabela de contas de email (metadados do Zoho)
CREATE TABLE `emailAccounts` (
	`id` int AUTO_INCREMENT PRIMARY KEY,
	`emailAddress` varchar(320) NOT NULL UNIQUE,
	`type` enum('principal', 'membro') NOT NULL DEFAULT 'membro',
	`createdAt` bigint NOT NULL DEFAULT CURRENT_TIMESTAMP * 1000,
	`updatedAt` bigint NOT NULL DEFAULT CURRENT_TIMESTAMP * 1000
);
