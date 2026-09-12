from pathlib import Path

router = Path('server/routers/vipInstallments.ts')
s = router.read_text(encoding='utf-8')

marker = 'async function refreshVipInstallmentOverdueStatuses()'
anchor = '\n\nexport const vipInstallmentsRouter = router({'
if marker not in s:
    if s.count(anchor) != 1:
        raise SystemExit('overdue helper anchor mismatch')
    helper = r'''
async function refreshVipInstallmentOverdueStatuses() {
  await ensureVipInstallmentInfrastructure();
  const db = (await getDb()) as any;
  if (!db) return 0;
  const today = getBrazilTodayForVipInstallments();

  return db.transaction(async (tx: any) => {
    const result = await tx.execute(sql`
      SELECT id, planId, dueDate
      FROM vipInstallments
      WHERE status='pending' AND dueDate < ${today}
      ORDER BY id ASC
      FOR UPDATE
    `);
    const rows = rowsOf<any>(result);
    if (rows.length === 0) return 0;

    const ids = rows.map((row) => Number(row.id)).filter((id) => Number.isSafeInteger(id) && id > 0);
    if (ids.length === 0) return 0;
    await tx.execute(sql`
      UPDATE vipInstallments
      SET status='overdue'
      WHERE status='pending' AND id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
    `);

    for (const row of rows) {
      await tx.execute(sql`
        INSERT INTO vipInstallmentHistory
          (planId, installmentId, action, actorType, actorId, previousValue, newValue, notes)
        VALUES
          (${Number(row.planId)}, ${Number(row.id)}, 'installment_overdue', 'system', 'system',
           ${JSON.stringify({ status: 'pending' })},
           ${JSON.stringify({ status: 'overdue', checkedAtDate: today })},
           'Parcela marcada automaticamente como vencida após a data de vencimento.')
      `);
    }
    return ids.length;
  });
}
'''
    s = s.replace(anchor, '\n' + helper + anchor, 1)

admin_anchor = '''  adminReceivables: adminProcedure.query(async () => {\n    await ensureVipInstallmentInfrastructure();'''
if admin_anchor in s and 'adminReceivables: adminProcedure.query(async () => {\n    await refreshVipInstallmentOverdueStatuses();' not in s:
    s = s.replace(admin_anchor, '''  adminReceivables: adminProcedure.query(async () => {\n    await refreshVipInstallmentOverdueStatuses();\n    await ensureVipInstallmentInfrastructure();''', 1)

myplans_anchor = '''      const customer = await customerByPhone(session.phone);\n      await ensureVipInstallmentInfrastructure();'''
myplans_start = s.index('  myPlans: publicProcedure')
myplans_tail = s[myplans_start:]
if 'await refreshVipInstallmentOverdueStatuses();' not in myplans_tail:
    if myplans_anchor not in myplans_tail:
        raise SystemExit('myPlans overdue anchor mismatch')
    myplans_tail = myplans_tail.replace(myplans_anchor, '''      const customer = await customerByPhone(session.phone);\n      await refreshVipInstallmentOverdueStatuses();\n      await ensureVipInstallmentInfrastructure();''', 1)
    s = s[:myplans_start] + myplans_tail

router.write_text(s, encoding='utf-8')
