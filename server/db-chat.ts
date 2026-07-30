import { getDb } from './db';
import { spreadsheetChats, chatMessages, spreadsheetOnlineStatus, chatNotifications } from '../drizzle/schema';
import { eq, and, like, inArray } from 'drizzle-orm';

// ========== CHATS ==========

export async function createChat(phone: string, participantPhones: string[], isGroup: number, groupName?: string) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const result = await db.insert(spreadsheetChats).values({
    phone,
    participantPhones: JSON.stringify(participantPhones),
    isGroup,
    groupName: groupName || null,
  });
  
  const chatId = Number(result[0].insertId);
  return await getChatById(chatId);
}

export async function getChatById(chatId: number) {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(spreadsheetChats).where(eq(spreadsheetChats.id, chatId)).limit(1);
  if (!result[0]) return null;
  
  return {
    ...result[0],
    participantPhones: JSON.parse(result[0].participantPhones as string),
  };
}

export async function listChatsForPhone(phone: string) {
  const db = await getDb();
  if (!db) return [];
  
  const results = await db.select().from(spreadsheetChats).where(
    like(spreadsheetChats.participantPhones, `%${phone}%`)
  );
  
  return results.map(chat => ({
    ...chat,
    participantPhones: JSON.parse(chat.participantPhones as string),
  }));
}

export async function findOrCreateIndividualChat(phone1: string, phone2: string) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  // Buscar chat existente entre os dois
  const existing = await db.select().from(spreadsheetChats).where(
    and(
      eq(spreadsheetChats.isGroup, 0),
      like(spreadsheetChats.participantPhones, `%${phone1}%`)
    )
  );
  
  for (const chat of existing) {
    const phones = JSON.parse(chat.participantPhones as string);
    if (phones.includes(phone1) && phones.includes(phone2)) {
      return {
        ...chat,
        participantPhones: phones,
      };
    }
  }
  
  // Criar novo chat
  const participants = [phone1, phone2].sort();
  return await createChat(phone1, participants, 0);
}

// ========== MESSAGES ==========

export async function sendMessage(chatId: number, senderPhone: string, message: string) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const result = await db.insert(chatMessages).values({
    chatId,
    senderPhone,
    message,
    readByPhones: JSON.stringify([senderPhone]), // Remetente jÃ¡ leu
  });
  
  const messageId = Number(result[0].insertId);
  return await getMessageById(messageId);
}

export async function getMessageById(messageId: number) {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(chatMessages).where(eq(chatMessages.id, messageId)).limit(1);
  if (!result[0]) return null;
  
  return {
    ...result[0],
    readByPhones: JSON.parse(result[0].readByPhones as string),
  };
}

export async function getMessagesForChat(chatId: number, limit: number = 50, offset: number = 0) {
  const db = await getDb();
  if (!db) return [];
  
  const results = await db.select()
    .from(chatMessages)
    .where(eq(chatMessages.chatId, chatId))
    .orderBy(chatMessages.createdAt)
    .limit(limit)
    .offset(offset);
  
  return results.map(msg => ({
    ...msg,
    readByPhones: JSON.parse(msg.readByPhones as string),
  }));
}

export async function markMessageAsRead(messageId: number, readerPhone: string) {
  const db = await getDb();
  if (!db) return null;
  
  const msg = await getMessageById(messageId);
  if (!msg) return null;
  
  const readByPhones = msg.readByPhones;
  if (!readByPhones.includes(readerPhone)) {
    readByPhones.push(readerPhone);
  }
  
  await db.update(chatMessages)
    .set({ readByPhones: JSON.stringify(readByPhones) })
    .where(eq(chatMessages.id, messageId));
  
  return await getMessageById(messageId);
}

// ========== ONLINE STATUS ==========

export async function setOnlineStatus(phone: string, isOnline: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  // Tenta atualizar, se nÃ£o existir, insere
  const existing = await db.select().from(spreadsheetOnlineStatus).where(eq(spreadsheetOnlineStatus.phone, phone)).limit(1);
  
  if (existing[0]) {
    await db.update(spreadsheetOnlineStatus)
      .set({ isOnline, lastSeenAt: new Date() })
      .where(eq(spreadsheetOnlineStatus.phone, phone));
  } else {
    await db.insert(spreadsheetOnlineStatus).values({
      phone,
      isOnline,
      lastSeenAt: new Date(),
    });
  }
  
  return await getOnlineStatus(phone);
}

export async function getOnlineStatus(phone: string) {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(spreadsheetOnlineStatus).where(eq(spreadsheetOnlineStatus.phone, phone)).limit(1);
  return result[0] || null;
}

export async function getOnlineUsers(phones: string[]) {
  const db = await getDb();
  if (!db) return [];
  
  if (phones.length === 0) return [];
  
  const results = await db.select().from(spreadsheetOnlineStatus).where(
    inArray(spreadsheetOnlineStatus.phone, phones)
  );
  
  // Considerar online apenas se atualizado nos Ãºltimos 90 segundos
  const ninetySecondsAgo = new Date(Date.now() - 90 * 1000);
  return results.filter(r => r.isOnline === 1 && new Date(r.lastSeenAt) > ninetySecondsAgo);
}

// Encontrar ou criar o Grupo Geral com todos os usuÃ¡rios
export async function findOrCreateGroupGeralChat(phone: string, allPhones: string[]) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const GROUP_NAME = 'Grupo Geral H2 COLOMBIANO';

  // Buscar grupo existente com esse nome
  const existing = await db.select().from(spreadsheetChats).where(
    and(
      eq(spreadsheetChats.isGroup, 1),
      eq(spreadsheetChats.groupName, GROUP_NAME)
    )
  ).limit(1);

  if (existing[0]) {
    // Atualizar participantes para incluir novos usuÃ¡rios se necessÃ¡rio
    const currentPhones: string[] = JSON.parse(existing[0].participantPhones as string);
    const newPhones = allPhones.filter(p => !currentPhones.includes(p));
    if (newPhones.length > 0) {
      const updatedPhones = Array.from(new Set([...currentPhones, ...allPhones]));
      await db.update(spreadsheetChats)
        .set({ participantPhones: JSON.stringify(updatedPhones) })
        .where(eq(spreadsheetChats.id, existing[0].id));
    }
    return {
      ...existing[0],
      participantPhones: JSON.parse(existing[0].participantPhones as string),
    };
  }

  // Criar novo grupo com todos os phones
  const allUnique = Array.from(new Set(allPhones));
  return await createChat(phone, allUnique, 1, GROUP_NAME);
}

// ========== NOTIFICATIONS ==========

export async function createOrUpdateNotification(phone: string, chatId: number, messagePreview: string, senderPhone: string) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const existing = await db.select().from(chatNotifications).where(
    and(
      eq(chatNotifications.phone, phone),
      eq(chatNotifications.chatId, chatId)
    )
  ).limit(1);
  
  if (existing[0]) {
    await db.update(chatNotifications)
      .set({
        unreadCount: existing[0].unreadCount + 1,
        lastMessagePreview: messagePreview,
        lastMessageSenderPhone: senderPhone,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(chatNotifications.phone, phone),
          eq(chatNotifications.chatId, chatId)
        )
      );
  } else {
    await db.insert(chatNotifications).values({
      phone,
      chatId,
      unreadCount: 1,
      lastMessagePreview: messagePreview,
      lastMessageSenderPhone: senderPhone,
    });
  }
  
  return await getNotification(phone, chatId);
}

export async function getNotification(phone: string, chatId: number) {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(chatNotifications).where(
    and(
      eq(chatNotifications.phone, phone),
      eq(chatNotifications.chatId, chatId)
    )
  ).limit(1);
  
  return result[0] || null;
}

export async function getNotificationsForPhone(phone: string) {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select().from(chatNotifications).where(eq(chatNotifications.phone, phone));
}

export async function clearNotification(phone: string, chatId: number) {
  const db = await getDb();
  if (!db) return;
  
  await db.delete(chatNotifications).where(
    and(
      eq(chatNotifications.phone, phone),
      eq(chatNotifications.chatId, chatId)
    )
  );
}

export async function markNotificationEmailSent(phone: string, chatId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(chatNotifications)
    .set({ emailSent: 1 })
    .where(
      and(
        eq(chatNotifications.phone, phone),
        eq(chatNotifications.chatId, chatId)
      )
    );
}

export async function deleteMessage(messageId: number, requesterPhone: string) {
  const db = await getDb();
  if (!db) return false;
  const msg = await db.select().from(chatMessages).where(eq(chatMessages.id, messageId)).limit(1);
  if (!msg[0] || msg[0].senderPhone !== requesterPhone) return false;
  await db.delete(chatMessages).where(eq(chatMessages.id, messageId));
  return true;
}
