-- Adiciona a ação manual sem alterar o ENUM já publicado da fila de preparação.
-- As linhas existentes permanecem em prepare_browser pelo valor padrão.
ALTER TABLE `h2ads_worker_commands`
  ADD COLUMN `commandAction` VARCHAR(32) NOT NULL DEFAULT 'prepare_browser' AFTER `command`;
