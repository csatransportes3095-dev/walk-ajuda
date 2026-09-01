import fs from 'node:fs';

function replaceOnce(file, before, after, label) {
  const src = fs.readFileSync(file, 'utf8');
  if (src.includes(after)) {
    console.log(`[patch] ${label}: already applied`);
    return;
  }
  const count = src.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`[patch] ${label}: expected exactly 1 anchor, found ${count}`);
  }
  fs.writeFileSync(file, src.replace(before, after));
  console.log(`[patch] ${label}: applied`);
}

const dbFile = 'server/db.ts';
const routersFile = 'server/routers.ts';
const testFile = 'server/scheduleOrderSync.test.ts';

replaceOnce(
  dbFile,
  `export async function completeConfirmedAppointmentsForOrder(registrationId: number, subOrderIndex: number): Promise<number> {\n  const db = await getDb();\n  if (!db) return 0;\n  const appointments = await db.select()\n    .from(scheduleAppointments)\n    .where(and(\n      eq(scheduleAppointments.registrationId, registrationId),\n      eq(scheduleAppointments.subOrderIndex, subOrderIndex),\n      eq(scheduleAppointments.status, 'confirmed'),\n    ));\n\n  for (const appointment of appointments) {\n    await completeAppointment(appointment.id);\n  }\n  return appointments.length;\n}\n`,
  `export async function completeConfirmedAppointmentsForOrder(registrationId: number, subOrderIndex: number): Promise<number> {\n  const db = await getDb();\n  if (!db) return 0;\n  const appointments = await db.select()\n    .from(scheduleAppointments)\n    .where(and(\n      eq(scheduleAppointments.registrationId, registrationId),\n      eq(scheduleAppointments.subOrderIndex, subOrderIndex),\n      eq(scheduleAppointments.status, 'confirmed'),\n    ));\n\n  for (const appointment of appointments) {\n    await completeAppointment(appointment.id);\n  }\n  return appointments.length;\n}\n\n/**\n * Ao avançar o pedido para Foto em Análise, encerra toda agenda ainda aberta\n * daquele pedido/subpedido. Preserva o histórico: pending/confirmed viram completed.\n */\nexport async function completeOpenAppointmentsForOrder(registrationId: number, subOrderIndex: number): Promise<number> {\n  const db = await getDb();\n  if (!db) return 0;\n  const appointments = await db.select()\n    .from(scheduleAppointments)\n    .where(and(\n      eq(scheduleAppointments.registrationId, registrationId),\n      eq(scheduleAppointments.subOrderIndex, subOrderIndex),\n      inArray(scheduleAppointments.status, ['pending', 'confirmed']),\n    ));\n\n  for (const appointment of appointments) {\n    await completeAppointment(appointment.id);\n  }\n  return appointments.length;\n}\n`,
  'add completeOpenAppointmentsForOrder'
);

replaceOnce(
  routersFile,
  `  updateLastOrderStatus,\n  createDocRequest,`,
  `  updateLastOrderStatus,\n  completeOpenAppointmentsForOrder,\n  createDocRequest,`,
  'import schedule completion helper'
);

replaceOnce(
  routersFile,
  `        if (!result.success) return result;\n\n        // Alterar o status do pedido não encerra nem modifica a agenda do cliente.\n        // Um agendamento confirmado permanece reservado e visível até uma ação\n        // explícita de concluir, cancelar ou reagendar no módulo de agendamentos.\n\n        // Ao marcar como entregue, remover urgência obrigatoriamente`,
  `        if (!result.success) return result;\n\n        // Foto em Análise encerra automaticamente a etapa de agendamento do mesmo\n        // pedido/subpedido. O histórico é preservado como completed, fazendo o pedido\n        // sair dos filtros Agendamento/Confirmado e cair somente em Foto em Análise.\n        if (input.status === 'foto_em_anal') {\n          await completeOpenAppointmentsForOrder(input.registrationId, input.subOrderIndex);\n        }\n\n        // Ao marcar como entregue, remover urgência obrigatoriamente`,
  'complete schedule when status becomes foto_em_anal'
);

replaceOnce(
  testFile,
  `  it("não encerra agendamento confirmado ao alterar o pedido para foto em análise", async () => {\n    const source = await routerSource();\n    const updateStart = source.indexOf("updateStatus: adminProcedure");\n    const updateEnd = source.indexOf("// Admin: atualizar orderSource", updateStart);\n    const updateProcedure = source.slice(updateStart, updateEnd);\n\n    expect(updateProcedure).not.toContain("SCHEDULE_COMPLETION_STATUSES");\n    expect(updateProcedure).not.toContain("completeConfirmedAppointmentsForOrder");\n    expect(updateProcedure).toContain("Alterar o status do pedido não encerra nem modifica a agenda do cliente.");\n  });`,
  `  it("encerra agenda pendente ou confirmada ao alterar o pedido para foto em análise", async () => {\n    const source = await routerSource();\n    const updateStart = source.indexOf("updateStatus: adminProcedure");\n    const updateEnd = source.indexOf("// Admin: atualizar orderSource", updateStart);\n    const updateProcedure = source.slice(updateStart, updateEnd);\n\n    expect(updateProcedure).toContain("if (input.status === 'foto_em_anal')");\n    expect(updateProcedure).toContain("completeOpenAppointmentsForOrder(input.registrationId, input.subOrderIndex)");\n  });\n\n  it("helper de Foto em Análise conclui somente agenda aberta do mesmo pedido/subpedido", async () => {\n    const source = await dbSource();\n    const start = source.indexOf("export async function completeOpenAppointmentsForOrder");\n    const helper = source.slice(start, source.indexOf("// CONFIRMAÇÃO ATÔMICA", start));\n\n    expect(helper).toContain("eq(scheduleAppointments.registrationId, registrationId)");\n    expect(helper).toContain("eq(scheduleAppointments.subOrderIndex, subOrderIndex)");\n    expect(helper).toContain("inArray(scheduleAppointments.status, ['pending', 'confirmed'])");\n    expect(helper).toContain("await completeAppointment(appointment.id)");\n  });`,
  'update schedule/status regression tests'
);

console.log('[patch] Foto em Análise schedule transition completed');
