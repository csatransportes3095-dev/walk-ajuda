-- Remover campos problemáticos da tabela zohoOAuthConfigs
ALTER TABLE `zohoOAuthConfigs` DROP COLUMN IF EXISTS `lastError`;
ALTER TABLE `zohoOAuthConfigs` DROP COLUMN IF EXISTS `lastTestAt`;
-- Alterar status para VARCHAR em vez de ENUM
ALTER TABLE `zohoOAuthConfigs` MODIFY `status` varchar(20) NOT NULL DEFAULT 'inactive';
