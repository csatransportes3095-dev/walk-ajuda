from pathlib import Path

ALIASES = "['foto_em_anal', 'foto_em_analise', 'foto_analise', 'em_analise']"

# 1) Backend: concluir agenda exata; fallback por telefone somente se o pedido nunca teve agenda própria.
db_path = Path('server/db.ts')
db = db_path.read_text(encoding='utf-8')
old_helper = '''export async function completeOpenAppointmentsForOrder(registrationId: number, subOrderIndex: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const appointments = await db.select()
    .from(scheduleAppointments)
    .where(and(
      eq(scheduleAppointments.registrationId, registrationId),
      eq(scheduleAppointments.subOrderIndex, subOrderIndex),
      inArray(scheduleAppointments.status, ['pending', 'confirmed']),
    ));

  for (const appointment of appointments) {
    await completeAppointment(appointment.id);
  }
  return appointments.length;
}'''
new_helper = '''export async function completeOpenAppointmentsForOrder(
  registrationId: number,
  subOrderIndex: number,
  customerPhone?: string,
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  // Regra principal: encerrar somente agenda aberta ligada exatamente ao pedido/subpedido.
  const directHistory = await db.select()
    .from(scheduleAppointments)
    .where(and(
      eq(scheduleAppointments.registrationId, registrationId),
      eq(scheduleAppointments.subOrderIndex, subOrderIndex),
    ))
    .orderBy(desc(scheduleAppointments.id));

  const directOpen = directHistory.filter(
    appointment => appointment.status === 'pending' || appointment.status === 'confirmed',
  );
  if (directOpen.length > 0) {
    for (const appointment of directOpen) {
      await completeAppointment(appointment.id);
    }
    return directOpen.length;
  }

  // Se este pedido já teve qualquer agenda própria, nunca encerrar agenda de outro pedido por telefone.
  if (directHistory.length > 0) return 0;

  // Compatibilidade com re-cadastro: algumas agendas antigas ficaram ligadas a outro registrationId.
  // O fallback só é usado quando não existe histórico direto e casa o mesmo telefone do pedido atual.
  const phoneDigits = String(customerPhone || '').replace(/\\D/g, '');
  if (phoneDigits.length < 8) return 0;
  const tail = phoneDigits.slice(-11);

  const openAppointments = await db.select()
    .from(scheduleAppointments)
    .where(inArray(scheduleAppointments.status, ['pending', 'confirmed']))
    .orderBy(desc(scheduleAppointments.id));

  const byPhone = openAppointments.filter(appointment => {
    const appointmentPhone = String(appointment.customerPhone || '').replace(/\\D/g, '');
    if (!appointmentPhone) return false;
    return appointmentPhone.endsWith(tail) || tail.endsWith(appointmentPhone.slice(-11));
  });

  // Mesma prioridade usada pelo ADM: confirmado antes de pendente, sempre no registro mais recente.
  const fallback = byPhone.find(appointment => appointment.status === 'confirmed')
    ?? byPhone.find(appointment => appointment.status === 'pending');
  if (!fallback) return 0;

  await completeAppointment(fallback.id);
  return 1;
}'''
if old_helper not in db:
    raise SystemExit('ERRO: helper completeOpenAppointmentsForOrder esperado nao encontrado')
db_path.write_text(db.replace(old_helper, new_helper, 1), encoding='utf-8')

# 2) Gatilho: reconhecer todas as chaves antigas/atuais e repassar telefone para fallback seguro.
router_path = Path('server/routers.ts')
router = router_path.read_text(encoding='utf-8')
old_trigger = """if (input.status === 'foto_em_anal') {
          await completeOpenAppointmentsForOrder(input.registrationId, input.subOrderIndex);
        }"""
new_trigger = f"""if ({ALIASES}.includes(input.status)) {{
          await completeOpenAppointmentsForOrder(input.registrationId, input.subOrderIndex, input.customerPhone);
        }}"""
if old_trigger not in router:
    raise SystemExit('ERRO: gatilho atual de Foto em Analise nao encontrado')
router_path.write_text(router.replace(old_trigger, new_trigger, 1), encoding='utf-8')

# 3) Atualizar teste existente para a regra nova.
test_path = Path('server/scheduleOrderSync.test.ts')
test = test_path.read_text(encoding='utf-8')
test = test.replace(
    "expect(updateProcedure).toContain(\"if (input.status === 'foto_em_anal')\");",
    f"expect(updateProcedure).toContain(\"if ({ALIASES}.includes(input.status))\");",
)
test = test.replace(
    'expect(updateProcedure).toContain("completeOpenAppointmentsForOrder(input.registrationId, input.subOrderIndex)");',
    'expect(updateProcedure).toContain("completeOpenAppointmentsForOrder(input.registrationId, input.subOrderIndex, input.customerPhone)");',
)
if f"if ({ALIASES}.includes(input.status))" not in test:
    raise SystemExit('ERRO: teste existente nao foi atualizado para aliases')
test_path.write_text(test, encoding='utf-8')

# 4) Teste adicional de regressao, sem banco externo.
regression = Path('server/h2FotoAnaliseSafe.test.ts')
regression.write_text(f'''import {{ describe, expect, it }} from "vitest";\nimport fs from "node:fs";\n\nconst dbSource = fs.readFileSync("server/db.ts", "utf8");\nconst routerSource = fs.readFileSync("server/routers.ts", "utf8");\n\ndescribe("H2 Foto em Analise - agenda", () => {{\n  it("reconhece todas as chaves de Foto em Analise", () => {{\n    expect(routerSource).toContain("if ({ALIASES}.includes(input.status))");\n  }});\n\n  it("repassa o telefone para compatibilidade de re-cadastro", () => {{\n    expect(routerSource).toContain("completeOpenAppointmentsForOrder(input.registrationId, input.subOrderIndex, input.customerPhone)");\n  }});\n\n  it("prioriza pedido/subpedido exato e nao usa telefone se existir historico direto", () => {{\n    expect(dbSource).toContain("eq(scheduleAppointments.registrationId, registrationId)");\n    expect(dbSource).toContain("eq(scheduleAppointments.subOrderIndex, subOrderIndex)");\n    expect(dbSource).toContain("if (directHistory.length > 0) return 0;");\n  }});\n\n  it("fallback por telefone so considera pending/confirmed e preserva historico via completeAppointment", () => {{\n    expect(dbSource).toContain("where(inArray(scheduleAppointments.status, ['pending', 'confirmed']))");\n    expect(dbSource).toContain("await completeAppointment(fallback.id)");\n  }});\n}});\n''', encoding='utf-8')

print('Patch H2 aplicado com sucesso na arvore de trabalho.')
