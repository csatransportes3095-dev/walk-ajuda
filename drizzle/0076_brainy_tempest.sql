ALTER TABLE `scheduleAppointments` ADD `customerPhotoUrl` text;--> statement-breakpoint
ALTER TABLE `scheduleAppointments` ADD `hasScheduleNotification` int DEFAULT 0 NOT NULL;