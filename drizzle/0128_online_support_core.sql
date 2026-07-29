CREATE TABLE IF NOT EXISTS `onlineSupportConfig` (
  `id` int NOT NULL AUTO_INCREMENT,
  `chatEnabled` tinyint NOT NULL DEFAULT 0,
  `welcomeButtonEnabled` tinyint NOT NULL DEFAULT 1,
  `floatingBubbleEnabled` tinyint NOT NULL DEFAULT 1,
  `autoReplyEnabled` tinyint NOT NULL DEFAULT 1,
  `aiEnabled` tinyint NOT NULL DEFAULT 0,
  `humanSupportEnabled` tinyint NOT NULL DEFAULT 1,
  `fileUploadEnabled` tinyint NOT NULL DEFAULT 1,
  `notificationsEnabled` tinyint NOT NULL DEFAULT 1,
  `maintenanceMode` tinyint NOT NULL DEFAULT 0,
  `allowedPages` text,
  `buttonSortOrder` int NOT NULL DEFAULT 3,
  `buttonLabel` varchar(128) NOT NULL DEFAULT 'ATENDIMENTO ONLINE',
  `buttonDescription` varchar(255) NOT NULL DEFAULT 'Tire suas duvidas, receba instrucoes e fale com nossa equipe.',
  `buttonIcon` varchar(64) NOT NULL DEFAULT 'message-circle',
  `buttonColor` varchar(32) NOT NULL DEFAULT '#2563eb',
  `openMode` varchar(32) NOT NULL DEFAULT 'modal',
  `disabledMessage` text,
  `welcomeMessage` text,
  `outOfHoursMessage` text,
  `defaultFallbackMessage` text,
  `aiProvider` varchar(64) NOT NULL DEFAULT 'openai',
  `aiModel` varchar(128) NOT NULL DEFAULT 'gpt-4o-mini',
  `aiTone` varchar(64) NOT NULL DEFAULT 'profissional',
  `aiMaxTokens` int NOT NULL DEFAULT 400,
  `aiErrorMessage` text,
  `blockedTopics` text,
  `handoffRule` varchar(64) NOT NULL DEFAULT 'no_safe_answer',
  `privacyConsentText` text,
  `updatedBy` varchar(128),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `onlineSupportVisitors` (
  `id` int NOT NULL AUTO_INCREMENT,
  `visitorId` varchar(128) NOT NULL,
  `name` varchar(128),
  `phone` varchar(32),
  `email` varchar(320),
  `originPage` varchar(512),
  `firstSeenAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `lastSeenAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `privacyConsent` tinyint NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_onlineSupportVisitors_visitorId` (`visitorId`),
  KEY `idx_onlineSupportVisitors_phone` (`phone`),
  KEY `idx_onlineSupportVisitors_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `onlineSupportConversations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `visitorId` varchar(128) NOT NULL,
  `visitorName` varchar(128),
  `visitorPhone` varchar(32),
  `visitorEmail` varchar(320),
  `originPage` varchar(512),
  `status` varchar(32) NOT NULL DEFAULT 'new',
  `assignedAgent` varchar(128),
  `botPaused` tinyint NOT NULL DEFAULT 0,
  `urgent` tinyint NOT NULL DEFAULT 0,
  `labels` text,
  `internalNotes` text,
  `lastMessageAt` timestamp NULL,
  `lastMessagePreview` text,
  `unreadForAdmin` int NOT NULL DEFAULT 0,
  `unreadForVisitor` int NOT NULL DEFAULT 0,
  `closedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_onlineSupportConversations_visitorId` (`visitorId`),
  KEY `idx_onlineSupportConversations_status` (`status`),
  KEY `idx_onlineSupportConversations_assignedAgent` (`assignedAgent`),
  KEY `idx_onlineSupportConversations_lastMessageAt` (`lastMessageAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `onlineSupportMessages` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `conversationId` int NOT NULL,
  `senderType` varchar(32) NOT NULL,
  `senderId` varchar(128),
  `senderName` varchar(128),
  `messageType` varchar(32) NOT NULL DEFAULT 'text',
  `text` text,
  `payloadJson` longtext,
  `isRead` tinyint NOT NULL DEFAULT 0,
  `isDelivered` tinyint NOT NULL DEFAULT 1,
  `dedupeKey` varchar(128),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_onlineSupportMessages_conversationId` (`conversationId`),
  KEY `idx_onlineSupportMessages_createdAt` (`createdAt`),
  KEY `idx_onlineSupportMessages_senderType` (`senderType`),
  UNIQUE KEY `uk_onlineSupportMessages_dedupeKey` (`dedupeKey`),
  CONSTRAINT `fk_onlineSupportMessages_conversation` FOREIGN KEY (`conversationId`) REFERENCES `onlineSupportConversations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `onlineSupportMenuItems` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(128) NOT NULL,
  `description` varchar(255),
  `icon` varchar(64),
  `color` varchar(32),
  `actionType` varchar(64) NOT NULL DEFAULT 'send_text',
  `actionPayloadJson` longtext,
  `sortOrder` int NOT NULL DEFAULT 0,
  `isActive` tinyint NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_onlineSupportMenuItems_sortOrder` (`sortOrder`),
  KEY `idx_onlineSupportMenuItems_isActive` (`isActive`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `onlineSupportAutoReplies` (
  `id` int NOT NULL AUTO_INCREMENT,
  `internalName` varchar(128) NOT NULL,
  `title` varchar(128) NOT NULL,
  `category` varchar(128),
  `relatedQuestionsJson` longtext,
  `keywordsJson` longtext,
  `priority` int NOT NULL DEFAULT 10,
  `responseText` text,
  `mediaJson` longtext,
  `buttonsJson` longtext,
  `nextStep` varchar(128),
  `waitTimeMs` int NOT NULL DEFAULT 0,
  `isActive` tinyint NOT NULL DEFAULT 1,
  `updatedBy` varchar(128),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_onlineSupportAutoReplies_priority` (`priority`),
  KEY `idx_onlineSupportAutoReplies_isActive` (`isActive`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `onlineSupportKnowledgeBase` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `category` varchar(128),
  `question` text,
  `answer` longtext,
  `keywordsJson` longtext,
  `linksJson` longtext,
  `mediaJson` longtext,
  `priority` int NOT NULL DEFAULT 10,
  `status` varchar(32) NOT NULL DEFAULT 'draft',
  `publishedAt` timestamp NULL,
  `author` varchar(128),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_onlineSupportKnowledgeBase_status` (`status`),
  KEY `idx_onlineSupportKnowledgeBase_category` (`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `onlineSupportFileLibrary` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `description` text,
  `category` varchar(128),
  `fileType` varchar(64) NOT NULL,
  `mimeType` varchar(128),
  `fileSize` bigint,
  `url` text NOT NULL,
  `thumbnailUrl` text,
  `status` varchar(32) NOT NULL DEFAULT 'active',
  `uploadedBy` varchar(128),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_onlineSupportFileLibrary_fileType` (`fileType`),
  KEY `idx_onlineSupportFileLibrary_category` (`category`),
  KEY `idx_onlineSupportFileLibrary_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `onlineSupportBusinessHours` (
  `id` int NOT NULL AUTO_INCREMENT,
  `weekDay` int NOT NULL,
  `openTime` varchar(5),
  `closeTime` varchar(5),
  `breakStart` varchar(5),
  `breakEnd` varchar(5),
  `isOpen` tinyint NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_onlineSupportBusinessHours_weekDay` (`weekDay`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `onlineSupportAgents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(128) NOT NULL,
  `displayName` varchar(128),
  `role` varchar(64) NOT NULL DEFAULT 'attendant',
  `permissionsJson` longtext,
  `isActive` tinyint NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_onlineSupportAgents_username` (`username`),
  KEY `idx_onlineSupportAgents_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `onlineSupportNotifications` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `conversationId` int,
  `type` varchar(64) NOT NULL,
  `title` varchar(255) NOT NULL,
  `message` text,
  `targetRole` varchar(64) NOT NULL DEFAULT 'admin',
  `targetUser` varchar(128),
  `isRead` tinyint NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_onlineSupportNotifications_targetRole` (`targetRole`),
  KEY `idx_onlineSupportNotifications_targetUser` (`targetUser`),
  KEY `idx_onlineSupportNotifications_isRead` (`isRead`),
  CONSTRAINT `fk_onlineSupportNotifications_conversation` FOREIGN KEY (`conversationId`) REFERENCES `onlineSupportConversations` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `onlineSupportLogs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `level` varchar(16) NOT NULL DEFAULT 'info',
  `source` varchar(128) NOT NULL,
  `event` varchar(128) NOT NULL,
  `message` text,
  `metaJson` longtext,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_onlineSupportLogs_level` (`level`),
  KEY `idx_onlineSupportLogs_source` (`source`),
  KEY `idx_onlineSupportLogs_event` (`event`),
  KEY `idx_onlineSupportLogs_createdAt` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `onlineSupportConfig` (
  `chatEnabled`, `welcomeButtonEnabled`, `floatingBubbleEnabled`, `autoReplyEnabled`, `aiEnabled`,
  `humanSupportEnabled`, `fileUploadEnabled`, `notificationsEnabled`, `maintenanceMode`,
  `allowedPages`, `buttonSortOrder`, `buttonLabel`, `buttonDescription`, `buttonIcon`, `buttonColor`,
  `openMode`, `disabledMessage`, `welcomeMessage`, `outOfHoursMessage`, `defaultFallbackMessage`,
  `aiProvider`, `aiModel`, `aiTone`, `aiMaxTokens`, `aiErrorMessage`, `blockedTopics`,
  `handoffRule`, `privacyConsentText`, `updatedBy`
)
SELECT
  0, 1, 1, 1, 0,
  1, 1, 1, 0,
  '["/","/acompanhar","/ajuda"]', 3, 'ATENDIMENTO ONLINE', 'Tire suas duvidas, receba instrucoes e fale com nossa equipe.', 'message-circle', '#2563eb',
  'modal', 'Atendimento indisponivel no momento.', 'Ola! Seja bem-vindo a Walk Ajuda. Como podemos ajudar?', 'Nossa equipe esta fora do horario de atendimento, mas o assistente virtual pode ajudar.', 'Nao encontrei uma resposta segura para essa pergunta. Vou encaminhar voce para um atendente.',
  'openai', 'gpt-4o-mini', 'profissional', 400, 'Falha temporaria ao consultar a inteligencia artificial.', '["senha","token","chave"]',
  'no_safe_answer', 'Ao iniciar o chat, voce concorda com nossa politica de privacidade.', 'system'
WHERE NOT EXISTS (SELECT 1 FROM `onlineSupportConfig` LIMIT 1);

INSERT INTO `onlineSupportBusinessHours` (`weekDay`, `openTime`, `closeTime`, `breakStart`, `breakEnd`, `isOpen`)
SELECT 1, '08:00', '18:00', NULL, NULL, 1 WHERE NOT EXISTS (SELECT 1 FROM `onlineSupportBusinessHours` WHERE `weekDay` = 1);
INSERT INTO `onlineSupportBusinessHours` (`weekDay`, `openTime`, `closeTime`, `breakStart`, `breakEnd`, `isOpen`)
SELECT 2, '08:00', '18:00', NULL, NULL, 1 WHERE NOT EXISTS (SELECT 1 FROM `onlineSupportBusinessHours` WHERE `weekDay` = 2);
INSERT INTO `onlineSupportBusinessHours` (`weekDay`, `openTime`, `closeTime`, `breakStart`, `breakEnd`, `isOpen`)
SELECT 3, '08:00', '18:00', NULL, NULL, 1 WHERE NOT EXISTS (SELECT 1 FROM `onlineSupportBusinessHours` WHERE `weekDay` = 3);
INSERT INTO `onlineSupportBusinessHours` (`weekDay`, `openTime`, `closeTime`, `breakStart`, `breakEnd`, `isOpen`)
SELECT 4, '08:00', '18:00', NULL, NULL, 1 WHERE NOT EXISTS (SELECT 1 FROM `onlineSupportBusinessHours` WHERE `weekDay` = 4);
INSERT INTO `onlineSupportBusinessHours` (`weekDay`, `openTime`, `closeTime`, `breakStart`, `breakEnd`, `isOpen`)
SELECT 5, '08:00', '18:00', NULL, NULL, 1 WHERE NOT EXISTS (SELECT 1 FROM `onlineSupportBusinessHours` WHERE `weekDay` = 5);
INSERT INTO `onlineSupportBusinessHours` (`weekDay`, `openTime`, `closeTime`, `breakStart`, `breakEnd`, `isOpen`)
SELECT 6, '08:00', '12:00', NULL, NULL, 1 WHERE NOT EXISTS (SELECT 1 FROM `onlineSupportBusinessHours` WHERE `weekDay` = 6);
INSERT INTO `onlineSupportBusinessHours` (`weekDay`, `openTime`, `closeTime`, `breakStart`, `breakEnd`, `isOpen`)
SELECT 0, NULL, NULL, NULL, NULL, 0 WHERE NOT EXISTS (SELECT 1 FROM `onlineSupportBusinessHours` WHERE `weekDay` = 0);

INSERT INTO `onlineSupportMenuItems` (`title`, `description`, `icon`, `color`, `actionType`, `actionPayloadJson`, `sortOrder`, `isActive`)
SELECT 'Fazer pedido', 'Abrir fluxo para criacao de pedido', 'shopping-cart', '#2563eb', 'send_buttons',
       '[{"label":"FAZER PEDIDO","actionType":"open_internal","actionPayload":{"path":"/"}},{"label":"VER VIDEO EXPLICATIVO","actionType":"open_internal","actionPayload":{"path":"/video/tutorial"}},{"label":"FALAR COM ATENDENTE","actionType":"handoff_human","actionPayload":{}}]', 1, 1
WHERE NOT EXISTS (SELECT 1 FROM `onlineSupportMenuItems` WHERE `title` = 'Fazer pedido');

INSERT INTO `onlineSupportMenuItems` (`title`, `description`, `icon`, `color`, `actionType`, `actionPayloadJson`, `sortOrder`, `isActive`)
SELECT 'Consultar pedido', 'Acompanhar status do pedido', 'search', '#059669', 'open_internal', '{"path":"/acompanhar"}', 2, 1
WHERE NOT EXISTS (SELECT 1 FROM `onlineSupportMenuItems` WHERE `title` = 'Consultar pedido');

INSERT INTO `onlineSupportMenuItems` (`title`, `description`, `icon`, `color`, `actionType`, `actionPayloadJson`, `sortOrder`, `isActive`)
SELECT 'Agendar atendimento', 'Escolher horario disponivel', 'calendar', '#7c3aed', 'send_text', '{"text":"Para agendar atendimento, envie seu nome completo e telefone."}', 3, 1
WHERE NOT EXISTS (SELECT 1 FROM `onlineSupportMenuItems` WHERE `title` = 'Agendar atendimento');

INSERT INTO `onlineSupportMenuItems` (`title`, `description`, `icon`, `color`, `actionType`, `actionPayloadJson`, `sortOrder`, `isActive`)
SELECT 'Ver videos explicativos', 'Tutoriais de uso', 'play-circle', '#0ea5e9', 'open_internal', '{"path":"/video/tutorial"}', 4, 1
WHERE NOT EXISTS (SELECT 1 FROM `onlineSupportMenuItems` WHERE `title` = 'Ver videos explicativos');

INSERT INTO `onlineSupportMenuItems` (`title`, `description`, `icon`, `color`, `actionType`, `actionPayloadJson`, `sortOrder`, `isActive`)
SELECT 'Duvidas frequentes', 'Acessar base de conhecimento', 'help-circle', '#f59e0b', 'send_text', '{"text":"Posso ajudar com pedidos, prazos, pagamento e documentacao. O que voce precisa?"}', 5, 1
WHERE NOT EXISTS (SELECT 1 FROM `onlineSupportMenuItems` WHERE `title` = 'Duvidas frequentes');

INSERT INTO `onlineSupportMenuItems` (`title`, `description`, `icon`, `color`, `actionType`, `actionPayloadJson`, `sortOrder`, `isActive`)
SELECT 'Falar com atendente', 'Encaminhar para equipe humana', 'user-round', '#ef4444', 'handoff_human', '{}', 6, 1
WHERE NOT EXISTS (SELECT 1 FROM `onlineSupportMenuItems` WHERE `title` = 'Falar com atendente');

INSERT INTO `onlineSupportAutoReplies` (`internalName`, `title`, `category`, `relatedQuestionsJson`, `keywordsJson`, `priority`, `responseText`, `mediaJson`, `buttonsJson`, `nextStep`, `waitTimeMs`, `isActive`, `updatedBy`)
SELECT 'como_fazer_pedido', 'Como fazer pedido', 'pedidos',
       '["Como faco pedido?","Quero fazer pedido","Onde faco meu pedido?","Como comprar?","Quero contratar","Manda o link","Como funciona o pedido?"]',
       '["fazer pedido","como comprar","quero contratar","manda o link","pedido"]',
       1,
       'Para fazer seu pedido, acesse nosso site oficial pelo botao abaixo.\n\nEscolha o servico desejado, preencha seus dados e finalize o pedido.',
       '{}',
       '[{"label":"FAZER PEDIDO","actionType":"open_internal","actionPayload":{"path":"/"}},{"label":"VER VIDEO EXPLICATIVO","actionType":"open_internal","actionPayload":{"path":"/video/tutorial"}},{"label":"FALAR COM ATENDENTE","actionType":"handoff_human","actionPayload":{}}]',
       'menu', 0, 1, 'system'
WHERE NOT EXISTS (SELECT 1 FROM `onlineSupportAutoReplies` WHERE `internalName` = 'como_fazer_pedido');
