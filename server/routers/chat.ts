import { z } from 'zod';
import { publicProcedure } from '../_core/trpc';
import {
  createChat,
  getChatById,
  listChatsForPhone,
  findOrCreateIndividualChat,
  sendMessage,
  getMessagesForChat,
  markMessageAsRead,
  setOnlineStatus,
  getOnlineStatus,
  getOnlineUsers,
  createOrUpdateNotification,
  getNotificationsForPhone,
  clearNotification,
  markNotificationEmailSent,
} from '../db-chat';

export const chatRouter = {
  // Listar todas as conversas do usuário
  listChats: publicProcedure
    .input(z.object({ phone: z.string() }))
    .query(async ({ input }: any) => {
      const chats = await listChatsForPhone(input.phone);
      const db = await (await import('../db')).getDb();
      const { spreadsheetClients, customers } = await import('../../drizzle/schema');
      const { eq } = await import('drizzle-orm');

      // Resolver nomes dos participantes
      const resolvedChats = await Promise.all(chats.map(async (chat: any) => {
        if (chat.isGroup) {
          return { ...chat, displayName: chat.groupName || 'Grupo', displayPhoto: null };
        }
        // Individual: pegar o outro participante
        const otherPhone = chat.participantPhones.find((p: string) => p !== input.phone);
        if (!otherPhone || !db) {
          return { ...chat, displayName: otherPhone || 'Desconhecido', displayPhoto: null };
        }
        // Buscar nome e foto pelo phone
        try {
          const clientResult = await db.select({ name: spreadsheetClients.name, phone: spreadsheetClients.phone })
            .from(spreadsheetClients)
            .where(eq(spreadsheetClients.phone, otherPhone))
            .limit(1);
          const client = clientResult[0];
          if (!client) return { ...chat, displayName: otherPhone, displayPhoto: null };

          // Buscar foto no customers
          const custResult = await db.select({ profilePhoto: customers.profilePhotoUrl })
            .from(customers)
            .where(eq(customers.phone, otherPhone))
            .limit(1);
          const photo = custResult[0]?.profilePhoto || null; // profilePhotoUrl

          return { ...chat, displayName: client.name || otherPhone, displayPhoto: photo };
        } catch {
          return { ...chat, displayName: otherPhone, displayPhoto: null };
        }
      }));

      return resolvedChats;
    }),

  // Criar conversa individual ou grupo
  createChat: publicProcedure
    .input(z.object({
      phone: z.string(),
      participantPhones: z.array(z.string()).min(1),
      isGroup: z.number().default(0),
      groupName: z.string().optional(),
    }))
    .mutation(async ({ input }: any) => {
      const chat = await createChat(
        input.phone,
        input.participantPhones,
        input.isGroup,
        input.groupName
      );
      return chat;
    }),

  // Encontrar ou criar o Grupo Geral (todos os usuários da planilha)
  findOrCreateGroupGeral: publicProcedure
    .input(z.object({
      phone: z.string(),
      allPhones: z.array(z.string()),
    }))
    .mutation(async ({ input }: any) => {
      const { findOrCreateGroupGeralChat } = await import('../db-chat');
      const chat = await findOrCreateGroupGeralChat(input.phone, input.allPhones);
      return chat;
    }),

  // Encontrar ou criar conversa individual
  findOrCreateIndividual: publicProcedure
    .input(z.object({
      phone: z.string(),
      otherPhone: z.string(),
    }))
    .mutation(async ({ input }: any) => {
      const chat = await findOrCreateIndividualChat(input.phone, input.otherPhone);
      return chat;
    }),

  // Enviar mensagem
  sendMessage: publicProcedure
    .input(z.object({
      chatId: z.number(),
      senderPhone: z.string(),
      message: z.string().min(1),
    }))
    .mutation(async ({ input }: any) => {
      const message = await sendMessage(input.chatId, input.senderPhone, input.message);
      
      if (!message) return { success: false };

      // Buscar chat para notificar outros participantes
      const chat = await getChatById(input.chatId);
      if (!chat) return { success: true, message };

      // Notificar todos os outros participantes
      for (const phone of chat.participantPhones) {
        if (phone !== input.senderPhone) {
          // Criar notificação
          const preview = input.message.substring(0, 100);
          await createOrUpdateNotification(phone, input.chatId, preview, input.senderPhone);


        }
      }

      return { success: true, message };
    }),

  // Obter mensagens de uma conversa
  getMessages: publicProcedure
    .input(z.object({
      chatId: z.number(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ input }: any) => {
      return await getMessagesForChat(input.chatId, input.limit, input.offset);
    }),

  // Marcar mensagem como lida
  markAsRead: publicProcedure
    .input(z.object({
      messageId: z.number(),
      readerPhone: z.string(),
    }))
    .mutation(async ({ input }: any) => {
      return await markMessageAsRead(input.messageId, input.readerPhone);
    }),

  // Atualizar status online
  setOnline: publicProcedure
    .input(z.object({
      phone: z.string(),
      isOnline: z.number(),
    }))
    .mutation(async ({ input }: any) => {
      return await setOnlineStatus(input.phone, input.isOnline);
    }),

  // Obter usuários online
  getOnlineUsers: publicProcedure
    .input(z.object({
      phones: z.array(z.string()),
    }))
    .query(async ({ input }: any) => {
      return await getOnlineUsers(input.phones);
    }),

  // Obter notificações não lidas
  getNotifications: publicProcedure
    .input(z.object({
      phone: z.string(),
    }))
    .query(async ({ input }: any) => {
      return await getNotificationsForPhone(input.phone);
    }),

  // Obter última mensagem de cada conversa (para preview)
  getLastMessagePerChat: publicProcedure
    .input(z.object({
      chatIds: z.array(z.number()),
    }))
    .query(async ({ input }: any) => {
      const results: Record<number, any> = {};
      for (const chatId of input.chatIds) {
        const msgs = await getMessagesForChat(chatId, 1, 0);
        // pegar a última (mais recente)
        const all = await getMessagesForChat(chatId, 50, 0);
        if (all.length > 0) {
          results[chatId] = all[all.length - 1];
        }
      }
      return results;
    }),

  // Deletar mensagem (apenas o remetente pode deletar)
  deleteMessage: publicProcedure
    .input(z.object({
      messageId: z.number(),
      requesterPhone: z.string(),
    }))
    .mutation(async ({ input }: any) => {
      const { deleteMessage } = await import('../db-chat');
      const ok = await deleteMessage(input.messageId, input.requesterPhone);
      return { success: ok };
    }),

  // Limpar notificação
  clearNotification: publicProcedure
    .input(z.object({
      phone: z.string(),
      chatId: z.number(),
    }))
    .mutation(async ({ input }: any) => {
      await clearNotification(input.phone, input.chatId);
      return { success: true };
    }),
};
