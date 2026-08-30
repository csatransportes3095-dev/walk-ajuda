ALTER TABLE `h2ads_groups`
  ADD COLUMN IF NOT EXISTS `cardColor` varchar(32) NOT NULL DEFAULT '#148CFF' AFTER `status`;
