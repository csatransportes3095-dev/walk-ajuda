-- Amplia somente os comandos manuais permitidos pela fila H2 Ads. Reaplicar a mesma definição é seguro.
ALTER TABLE `h2ads_worker_commands`
  MODIFY COLUMN `command` ENUM('prepare_browser', 'launch_browser', 'close_browser') NOT NULL;
