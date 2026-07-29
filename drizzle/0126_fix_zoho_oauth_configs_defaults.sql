-- Alterar a tabela zohoOAuthConfigs para adicionar defaults nos campos lastError e lastTestAt
ALTER TABLE `zohoOAuthConfigs` MODIFY `lastError` text DEFAULT '';
ALTER TABLE `zohoOAuthConfigs` MODIFY `lastTestAt` bigint DEFAULT 0;
