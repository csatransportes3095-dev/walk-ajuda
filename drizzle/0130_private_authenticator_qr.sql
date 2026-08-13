ALTER TABLE `orderLoginData`
  ADD COLUMN `authenticatorQrStorageKey` varchar(512) NULL,
  ADD COLUMN `authenticatorQrMimeType` varchar(64) NULL,
  ADD COLUMN `authenticatorQrUpdatedAt` timestamp NULL;
