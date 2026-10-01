CREATE TABLE IF NOT EXISTS `orderStatusFlows` (
  `id` int AUTO_INCREMENT NOT NULL,
  `name` varchar(128) NOT NULL,
  `description` text,
  `isDefault` int NOT NULL DEFAULT 0,
  `isActive` int NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `orderStatusFlows_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `orderStatusFlowItems` (
  `id` int AUTO_INCREMENT NOT NULL,
  `flowId` int NOT NULL,
  `statusKey` varchar(64) NOT NULL,
  `sortOrder` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `orderStatusFlowItems_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_status_flow_item` UNIQUE(`flowId`,`statusKey`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `productStatusFlows` (
  `id` int AUTO_INCREMENT NOT NULL,
  `productId` int NOT NULL,
  `flowId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `productStatusFlows_id` PRIMARY KEY(`id`),
  CONSTRAINT `productStatusFlows_productId_unique` UNIQUE(`productId`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `orderStatusFlowAssignments` (
  `id` int AUTO_INCREMENT NOT NULL,
  `registrationId` int NOT NULL,
  `orderStatusId` int NOT NULL,
  `orderNumber` int,
  `productId` int,
  `optionId` int,
  `flowId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `orderStatusFlowAssignments_id` PRIMARY KEY(`id`),
  CONSTRAINT `orderStatusFlowAssignments_orderStatusId_unique` UNIQUE(`orderStatusId`)
);
