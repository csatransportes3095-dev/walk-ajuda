ALTER TABLE `orderStatusTypes`
  ADD COLUMN IF NOT EXISTS `imageUrl` TEXT NULL AFTER `icon`;
