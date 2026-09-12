import fs from 'node:fs';

function patchFile(filePath, patches) {
  let source = fs.readFileSync(filePath, 'utf8');
  for (const patch of patches) {
    if (source.includes(patch.after)) {
      console.log(`[schedule-stage-close] ${filePath}: ${patch.name} ja aplicado`);
      continue;
    }
    if (!source.includes(patch.before)) {
      throw new Error(`[schedule-stage-close] alvo nao encontrado em ${filePath}: ${patch.name}`);
    }
    source = source.replace(patch.before, patch.after);
    console.log(`[schedule-stage-close] ${filePath}: ${patch.name} aplicado`);
  }
  fs.writeFileSync(filePath, source, 'utf8');
}

const closedStatusesLiteral = [
  "'foto_em_anal'", "'foto_em_analise'", "'foto_analise'", "'em_analise'",
  "'documentos_aprovados'", "'foto_aprovada'", "'foto_perfil_aprovada'",
  "'aguardando_ativa'", "'aguardando_ficar_ativa'",
  "'conta_ativa'", "'p'",
].join(', ');

patchFile('server/routers.ts', [{
  name: 'encerrar agenda nas etapas posteriores a foto em analise',
  before: `        // Foto em Análise encerra automaticamente a etapa de agendamento do mesmo\n        // pedido/subpedido. O histórico é preservado como completed, fazendo o pedido\n        // sair dos filtros Agendamento/Confirmado e cair somente em Foto em Análise.\n        if (['foto_em_anal', 'foto_em_analise', 'foto_analise', 'em_analise'].includes(input.status)) {\n          await completeOpenAppointmentsForOrder(input.registrationId, input.subOrderIndex, input.customerPhone);\n        }`,
  after: `        // A etapa de agendamento termina em Foto em Análise ou em qualquer etapa posterior.\n        // Também cobre o caso em que o operador avança direto para Foto Aprovada/Conta Ativa.\n        const scheduleClosedOrderStatuses = new Set([${closedStatusesLiteral}]);\n        if (scheduleClosedOrderStatuses.has(input.status)) {\n          await completeOpenAppointmentsForOrder(input.registrationId, input.subOrderIndex, input.customerPhone);\n        }`,
}]);

patchFile('shared/orderBuckets.ts', [{
  name: 'status posterior prevalece sobre agenda antiga',
  before: `  // Agendamentos ainda abertos têm prioridade sobre o status operacional.\n  if (order.scheduleStatus === "confirmed") return "agendamento_confirmado";\n  if (order.scheduleStatus === "pending") return "agendamento";\n\n  // Foto de perfil aprovada: status automático já existente no pedido.\n  if (["documentos_aprovados", "foto_aprovada", "foto_perfil_aprovada"].includes(status)) {\n    return "foto_aprovada";\n  }\n\n  // Chaves canônicas atuais, com aliases legados apenas como compatibilidade.\n  if (["conta_ativa", "p"].includes(status)) return "conta_ativa";\n  if (["aguardando_ativa", "aguardando_ficar_ativa"].includes(status)) {\n    return "aguardando_ativa";\n  }\n  if (["em_analise", "foto_em_analise", "foto_em_anal"].includes(status)) {\n    return "em_analise";\n  }`,
  after: `  // A partir de Foto em Análise, o status real do pedido prevalece sobre qualquer\n  // agendamento antigo que ainda exista por legado/re-cadastro.\n  if (["em_analise", "foto_em_analise", "foto_em_anal", "foto_analise"].includes(status)) {\n    return "em_analise";\n  }\n  if (["documentos_aprovados", "foto_aprovada", "foto_perfil_aprovada"].includes(status)) {\n    return "foto_aprovada";\n  }\n  if (["aguardando_ativa", "aguardando_ficar_ativa"].includes(status)) {\n    return "aguardando_ativa";\n  }\n  if (["conta_ativa", "p"].includes(status)) return "conta_ativa";\n\n  // Agendamento só tem prioridade enquanto o pedido ainda não avançou para Foto em Análise.\n  if (order.scheduleStatus === "confirmed") return "agendamento_confirmado";\n  if (order.scheduleStatus === "pending") return "agendamento";`,
}]);

patchFile('client/src/components/ScheduleStatusBadge.tsx', [{
  name: 'ocultar selo de agenda depois da etapa de foto',
  before: `  // Quando o agendamento ou o pedido já foi concluído, o card mostra somente o status atual do pedido.\n  const finalOrder = ['entregue', 'pedido_entregue', 'cancelado'].includes(String(orderStatus || ''));\n  if (appt?.status === "completed" || finalOrder) return null;`,
  after: `  // Depois de Foto em Análise, o card deve mostrar somente o status real do pedido.\n  // Isto impede que um agendamento legado/re-cadastro reapareça em Foto Aprovada ou Conta Ativa.\n  const status = String(orderStatus || '');\n  const scheduleClosedByOrder = [\n    'foto_em_anal', 'foto_em_analise', 'foto_analise', 'em_analise',\n    'documentos_aprovados', 'foto_aprovada', 'foto_perfil_aprovada',\n    'aguardando_ativa', 'aguardando_ficar_ativa', 'conta_ativa', 'p',\n    'entregue', 'pedido_entregue', 'cancelado',\n  ].includes(status);\n  if (appt?.status === "completed" || scheduleClosedByOrder) return null;`,
}]);

patchFile('server/routers/schedule.ts', [
  {
    name: 'importar reconciliador de agenda',
    before: `  cancelAppointment, reopenAppointment, confirmAppointment, listAppointments, deleteAppointment, completeAppointment,`,
    after: `  cancelAppointment, reopenAppointment, confirmAppointment, listAppointments, deleteAppointment, completeAppointment, completeOpenAppointmentsForOrder,`,
  },
  {
    name: 'detectar status exato do subpedido',
    before: `async function getPublicOrderContext(registrationId: number) {\n  const latestStatus = await getLatestOrderStatus(registrationId);\n  const statusKey = latestStatus?.status ? String(latestStatus.status) : null;\n  return {\n    statusKey,\n    statusLabel: statusKey ? await getStatusLabelFromDb(statusKey) : null,\n  };\n}`,
    after: `async function getPublicOrderContext(registrationId: number) {\n  const latestStatus = await getLatestOrderStatus(registrationId);\n  const statusKey = latestStatus?.status ? String(latestStatus.status) : null;\n  return {\n    statusKey,\n    statusLabel: statusKey ? await getStatusLabelFromDb(statusKey) : null,\n  };\n}\n\nconst SCHEDULE_CLOSED_ORDER_STATUSES = new Set([${closedStatusesLiteral}]);\n\nexport function isScheduleClosedOrderStatus(status: unknown): boolean {\n  return SCHEDULE_CLOSED_ORDER_STATUSES.has(String(status || ''));\n}\n\nasync function getExactOrderStatus(registrationId: number, subOrderIndex: number): Promise<string | null> {\n  const db = await getDb();\n  if (!db) return null;\n  const statusRows = await rows(db, sql\`\n    SELECT status\n    FROM orderStatusHistory\n    WHERE registrationId=\${registrationId} AND subOrderIndex=\${subOrderIndex}\n    ORDER BY id DESC\n    LIMIT 1\n  \`);\n  return statusRows[0]?.status ? String(statusRows[0].status) : null;\n}`,
  },
  {
    name: 'auto-reconciliar agenda antiga antes do fallback por telefone',
    before: `    .query(async ({ input }) => {\n      let appt = await getAppointmentByOrder(input.registrationId, input.subOrderIndex);\n      // Fallback por TELEFONE: agendamentos podem ter sido vinculados a um\n      // registrationId antigo/diferente do mesmo cliente (re-cadastro). Se não\n      // encontrar pela chave do pedido, casa pelo telefone (chave confiável),\n      // priorizando o agendamento confirmado mais recente.\n      if (!appt && input.customerPhone) {`,
    after: `    .query(async ({ input }) => {\n      const currentOrderStatus = await getExactOrderStatus(input.registrationId, input.subOrderIndex);\n      let appt = await getAppointmentByOrder(input.registrationId, input.subOrderIndex);\n\n      // Auto-correção: se o pedido já chegou em Foto em Análise (ou etapa posterior),\n      // encerra qualquer agenda aberta relacionada. Não altera regras de horários/slots.\n      if (isScheduleClosedOrderStatus(currentOrderStatus)) {\n        await completeOpenAppointmentsForOrder(input.registrationId, input.subOrderIndex, input.customerPhone);\n        appt = await getAppointmentByOrder(input.registrationId, input.subOrderIndex);\n        // Se era um vínculo legado apenas por telefone, ele foi encerrado e não deve\n        // reaparecer no pedido atual via fallback.\n        if (!appt) return null;\n      }\n\n      // Fallback por TELEFONE: agendamentos podem ter sido vinculados a um\n      // registrationId antigo/diferente do mesmo cliente (re-cadastro). Se não\n      // encontrar pela chave do pedido, casa pelo telefone (chave confiável),\n      // priorizando o agendamento confirmado mais recente.\n      if (!appt && input.customerPhone && !isScheduleClosedOrderStatus(currentOrderStatus)) {`,
  },
]);

const verification = [
  ['server/routers.ts', "'conta_ativa', 'p'"],
  ['shared/orderBuckets.ts', 'Agendamento só tem prioridade enquanto o pedido ainda não avançou para Foto em Análise.'],
  ['client/src/components/ScheduleStatusBadge.tsx', 'scheduleClosedByOrder'],
  ['server/routers/schedule.ts', 'getExactOrderStatus'],
  ['server/routers/schedule.ts', 'completeOpenAppointmentsForOrder(input.registrationId, input.subOrderIndex, input.customerPhone)'],
];
for (const [filePath, marker] of verification) {
  const source = fs.readFileSync(filePath, 'utf8');
  if (!source.includes(marker)) throw new Error(`[schedule-stage-close] verificacao falhou: ${filePath} sem ${marker}`);
}

console.log('[schedule-stage-close] OK: regra de encerramento reforcada sem alterar slots, horarios ou reagendamento.');
