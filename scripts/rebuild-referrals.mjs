#!/usr/bin/env node
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/mysql2';
import { eq, isNotNull } from 'drizzle-orm';
import * as schema from '../drizzle/schema.ts';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL não configurada');
  process.exit(1);
}

const db = drizzle(DATABASE_URL);

async function rebuildReferrals() {
  try {
    console.log('🔄 Iniciando reconstrução da árvore de indicações...\n');

    // Limpar tabelas existentes
    console.log('🧹 Limpando tabelas de indicações...');
    await db.delete(schema.referralHistory);
    await db.delete(schema.referralStats);
    console.log('✅ Tabelas limpas\n');

    // Buscar todos os clientes com indicador
    console.log('🔍 Buscando clientes com indicadores...');
    const customersWithReferrer = await db.select()
      .from(schema.customers)
      .where(isNotNull(schema.customers.referredByPhone));

    console.log(`✅ Encontrados ${customersWithReferrer.length} clientes com indicadores\n`);

    let processedCount = 0;
    let errorCount = 0;

    for (const customer of customersWithReferrer) {
      try {
        const referrerPhone = (customer.referredByPhone || '').replace(/\D/g, '');
        const referredPhone = (customer.phone || '').replace(/\D/g, '');

        if (!referrerPhone || !referredPhone) {
          console.log(`⚠️  Cliente ${customer.customer_id} (${customer.name}): telefone inválido`);
          continue;
        }

        // Buscar indicador
        const referrers = await db.select()
          .from(schema.customers)
          .where(eq(schema.customers.phone, referrerPhone))
          .limit(1);

        if (!referrers || referrers.length === 0) {
          console.log(`⚠️  Cliente ${customer.customer_id}: Indicador não encontrado (${referrerPhone})`);
          continue;
        }

        const referrerName = referrers[0].name || customer.referredBy || 'Indicador';

        // Registrar no histórico
        await db.insert(schema.referralHistory).values({
          referrerPhone,
          referrerName,
          referredCustomerId: customer.id,
          referredPhone,
          referredName: customer.name,
          status: 'completed',
          createdAt: new Date(),
        });

        // Atualizar ou criar stats
        const existingStats = await db.select()
          .from(schema.referralStats)
          .where(eq(schema.referralStats.referrerPhone, referrerPhone))
          .limit(1);

        if (existingStats && existingStats.length > 0) {
          await db.update(schema.referralStats)
            .set({
              totalReferred: (existingStats[0].totalReferred || 0) + 1,
              lastReferralAt: new Date(),
            })
            .where(eq(schema.referralStats.referrerPhone, referrerPhone));
        } else {
          await db.insert(schema.referralStats).values({
            referrerPhone,
            referrerName,
            totalReferred: 1,
            lastReferralAt: new Date(),
            createdAt: new Date(),
          });
        }

        processedCount++;
        console.log(`✅ ${processedCount}. ${customer.name} (#${customer.customer_id}) ← ${referrerName}`);
      } catch (err) {
        errorCount++;
        console.error(`❌ Erro ao processar cliente ${customer.customer_id}:`, err.message);
      }
    }

    console.log(`\n📊 RESUMO:`);
    console.log(`✅ Processados: ${processedCount}`);
    console.log(`❌ Erros: ${errorCount}`);
    console.log(`\n🎉 Reconstrução concluída!`);

    // Mostrar top indicadores
    const topReferrers = await db.select()
      .from(schema.referralStats)
      .orderBy((t) => t.totalReferred)
      .limit(10);

    if (topReferrers && topReferrers.length > 0) {
      console.log(`\n🏆 TOP 10 INDICADORES:`);
      topReferrers.reverse().forEach((r, i) => {
        console.log(`${i + 1}. ${r.referrerName} - ${r.totalReferred} indicações`);
      });
    }

    process.exit(0);
  } catch (err) {
    console.error('❌ Erro fatal:', err);
    process.exit(1);
  }
}

rebuildReferrals();
