import { z } from 'zod';
import { publicProcedure } from '../_core/trpc';
import { getDb } from '../db';
import { spreadsheetClients, customers, spreadsheetSessions } from '../../drizzle/schema';
import { eq } from 'drizzle-orm';

export const chatUsersRouter = {
  // Listar todos os usuários da planilha (spreadsheetClients) com foto e nome do customers
  listAllUsers: publicProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return [];

      try {
        // Buscar todos os clientes da planilha com join para pegar foto do customers
        const rows = await db
          .select({
            phone: spreadsheetClients.phone,
            name: spreadsheetClients.name,
            profilePhotoUrl: customers.profilePhotoUrl,
          })
          .from(spreadsheetClients)
          .leftJoin(customers, eq(customers.phone, spreadsheetClients.phone))
          .limit(500);

        return rows.map((row) => {
          const firstName = row.name ? row.name.split(' ')[0].replace(/^\./, '') : 'Usuário';
          return {
            phone: row.phone,
            name: firstName,
            fullName: row.name,
            profilePhoto: row.profilePhotoUrl || null,
          };
        });
      } catch (error) {
        console.error('[Chat Users] Erro ao listar usuários:', error);
        return [];
      }
    }),

  // Resolver phone a partir do token de sessão da planilha
  getPhoneFromToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      try {
        // Buscar sessão pelo token
        const sessions = await db
          .select({ clientId: spreadsheetSessions.clientId })
          .from(spreadsheetSessions)
          .where(eq(spreadsheetSessions.token, input.token.trim()))
          .limit(1);

        if (!sessions[0]) return null;

        const clientId = sessions[0].clientId;

        // Buscar phone do cliente
        const clients = await db
          .select({ phone: spreadsheetClients.phone, name: spreadsheetClients.name })
          .from(spreadsheetClients)
          .where(eq(spreadsheetClients.id, clientId as number))
          .limit(1);

        if (!clients[0]) return null;

        return { phone: clients[0].phone, name: clients[0].name };
      } catch (error) {
        console.error('[Chat] Erro ao resolver phone do token:', error);
        return null;
      }
    }),

  // Buscar usuário específico pelo telefone
  getUser: publicProcedure
    .input(z.object({ phone: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      try {
        // Primeiro tenta no spreadsheetClients
        const scRows = await db
          .select({
            phone: spreadsheetClients.phone,
            name: spreadsheetClients.name,
            profilePhotoUrl: customers.profilePhotoUrl,
          })
          .from(spreadsheetClients)
          .leftJoin(customers, eq(customers.phone, spreadsheetClients.phone))
          .where(eq(spreadsheetClients.phone, input.phone))
          .limit(1);

        if (scRows[0]) {
          const firstName = scRows[0].name ? scRows[0].name.split(' ')[0].replace(/^\./, '') : 'Usuário';
          return {
            phone: scRows[0].phone,
            name: firstName,
            fullName: scRows[0].name,
            profilePhoto: scRows[0].profilePhotoUrl || null,
          };
        }

        // Fallback: buscar direto no customers
        const custRows = await db
          .select()
          .from(customers)
          .where(eq(customers.phone, input.phone))
          .limit(1);

        if (!custRows[0]) return null;

        const firstName = custRows[0].name ? custRows[0].name.split(' ')[0] : 'Usuário';
        return {
          phone: custRows[0].phone,
          name: firstName,
          fullName: custRows[0].name,
          profilePhoto: (custRows[0] as any).profilePhotoUrl || null,
        };
      } catch (error) {
        console.error('[Chat Users] Erro ao buscar usuário:', error);
        return null;
      }
    }),
};
