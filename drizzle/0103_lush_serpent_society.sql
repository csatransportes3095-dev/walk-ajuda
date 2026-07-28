ALTER TABLE `adminMediaFiles` ADD `videoSlug` varchar(128);--> statement-breakpoint
ALTER TABLE `adminMediaFiles` ADD CONSTRAINT `adminMediaFiles_videoSlug_unique` UNIQUE(`videoSlug`);