import fs from 'node:fs';

function replaceRequired(source, search, replacement, label) {
  const next = typeof search === 'string' ? source.replace(search, replacement) : source.replace(search, replacement);
  if (next === source) throw new Error(`Patch nao encontrou: ${label}`);
  return next;
}

function patchLoansRouter() {
  const file = 'server/routers/loans.ts';
  let s = fs.readFileSync(file, 'utf8');

  s = replaceRequired(
    s,
    'import { calculateLateFeeForInstallment, isLateFeeWindowOpen } from "../loans/lateFee";',
    'import { calculateLateFeeForInstallment } from "../loans/lateFee";',
    'import lateFee',
  );

  s = replaceRequired(
    s,
    /function getBrazilClock\(now = new Date\(\)\): \{ today: string; date: string; hour: number \} \{[\s\S]*?\n\}\n\nfunction getBrazilToday\(\): string \{/,
    `function getBrazilClock(now = new Date()): { today: string; date: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const valueOf = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "0";
  const today = \`${'${valueOf("year")}-${valueOf("month")}-${valueOf("day")}'}\`;
  return {
    today,
    date: today,
    hour: Number(valueOf("hour")),
    minute: Number(valueOf("minute")),
  };
}

function getBrazilToday(): string {`,
    'relogio Sao Paulo com minuto',
  );

  s = replaceRequired(
    s,
    /  getClientInstallments: publicProcedure\.input\(z\.object\(\{[\s\S]*?\n  \}\),\n\n  submitInstallmentProof:/,
    `  getClientInstallments: publicProcedure.input(z.object({
    token: z.string(),
    loanId: z.number(),
  })).query(async ({ input }) => {
    const db = await getDb() as any;
    await requireLoanRouteAccess(db, input.token);
    const token = input.token.trim();
    const clients = await qRows(db, drizzleSql\`SELECT * FROM loanClients WHERE spreadsheetToken=\${token}\`);
    if (!clients.length) throw new TRPCError({ code: "UNAUTHORIZED" });
    const client = clients[0];
    const identities = await qRows(db, drizzleSql\`SELECT id, cpf, phone FROM loanClients\`);
    const clientIds = Array.from(new Set([
      Number(client.id),
      ...identities.filter((row: any) => isSameLoanIdentity(row, client.cpf, client.phone)).map((row: any) => Number(row.id)),
    ].filter(Boolean)));
    const loans = await qRows(db, drizzleSql\`SELECT * FROM loans WHERE id=\${input.loanId} AND clientId IN (\${drizzleSql.raw(clientIds.join(','))})\`);
    if (!loans.length) throw new TRPCError({ code: "NOT_FOUND" });

    const loan = loans[0];
    const clock = getBrazilClock();
    const rawInstallments = await qRows(db, drizzleSql\`SELECT * FROM loanInstallments WHERE loanId=\${input.loanId} ORDER BY installmentNumber ASC\`);
    const scoreByInstallment = await getH2ScoreSubmissionMap(db, rawInstallments.map((i: any) => Number(i.id)));
    const configRows = await qRows(db, drizzleSql\`SELECT * FROM loan_late_fee_config WHERE id=1 LIMIT 1\`);
    const lateFeeConfig = configRows[0];
    const isDailyLoan = String(loan.paymentType || '') === 'diario';

    const installments = rawInstallments.map((i: any) => {
      const eligible = isDailyLoan
        && !client.late_fee_disabled
        && ["pendente", "atrasado"].includes(i.status);
      const baseAmount = i.originalAmount != null ? Number(i.originalAmount || 0) : Number(i.amount || 0);
      const storedFee = i.feeApplied != null ? Number(i.feeApplied || 0) : 0;
      const automaticFee = eligible
        ? calculateLateFeeForInstallment({ dueDate: i.dueDate, amount: baseAmount, config: lateFeeConfig, clock })
        : 0;
      // Uma taxa manual maior nunca e reduzida. Se a regra automatica subir, o cliente
      // ve imediatamente o maior valor, mesmo antes da persistencia no banco.
      const effectiveFee = Math.max(storedFee, automaticFee);
      const amountWithFee = effectiveFee > 0
        ? Math.round((baseAmount + effectiveFee) * 100) / 100
        : Number(i.amount || 0);

      return {
        ...i,
        amount: amountWithFee,
        ...(effectiveFee > 0 ? {
          originalAmount: baseAmount.toFixed(2),
          feeApplied: effectiveFee.toFixed(2),
          lateFeePreview: automaticFee > storedFee,
        } : {}),
        h2ScoreSubmission: scoreByInstallment.get(Number(i.id)) || null,
        isOverdue: !["pago"].includes(i.status) && i.dueDate < clock.today,
      };
    });
    return { loan, installments };
  }),

  submitInstallmentProof:`,
    'preview publico diario',
  );

  s = replaceRequired(
    s,
    /  submitInstallmentProof: publicProcedure\.input\(z\.object\(\{[\s\S]*?\n  \}\),\n\n  \/\/ Simulação de parcelas/,
    `  submitInstallmentProof: publicProcedure.input(z.object({
    token: z.string(),
    installmentId: z.number(),
    fileBase64: z.string(),
    fileName: z.string(),
    mimeType: z.string(),
  })).mutation(async ({ input }) => {
    const db = await getDb() as any;
    await requireLoanRouteAccess(db, input.token);
    const token = input.token.trim();
    const clients = await qRows(db, drizzleSql\`SELECT * FROM loanClients WHERE spreadsheetToken=\${token}\`);
    if (!clients.length) throw new TRPCError({ code: "UNAUTHORIZED" });
    const client = clients[0];
    const identities = await qRows(db, drizzleSql\`SELECT id, cpf, phone FROM loanClients\`);
    const clientIds = Array.from(new Set([
      Number(client.id),
      ...identities.filter((row: any) => isSameLoanIdentity(row, client.cpf, client.phone)).map((row: any) => Number(row.id)),
    ].filter(Boolean)));

    const inst = await qRows(db, drizzleSql\`
      SELECT li.*, l.paymentType AS loanPaymentType FROM loanInstallments li
      JOIN loans l ON l.id = li.loanId
      WHERE li.id=\${input.installmentId} AND l.clientId IN (\${drizzleSql.raw(clientIds.join(','))})
    \`);
    if (!inst.length) throw new TRPCError({ code: "NOT_FOUND" });
    if (inst[0].status === 'em_analise' || inst[0].proofSentAt) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Já existe um comprovante em análise para esta parcela." });
    }

    const receivedAt = new Date();
    const buffer = Buffer.from(input.fileBase64, "base64");
    const key = \`loan-proofs/\${client.id}/\${input.installmentId}-\${Date.now()}-\${input.fileName}\`;
    const { url } = await storagePut(key, buffer, input.mimeType);

    // Ultima barreira antes do comprovante: somente parcela DIARIA recebe taxa automatica.
    // O servidor recalcula com o horario de Sao Paulo e nunca permite que uma taxa manual
    // maior seja substituida por uma automatica menor.
    const row = inst[0];
    const clock = getBrazilClock();
    const dueDateValue = row.dueDate;
    const dueDate = typeof dueDateValue === 'string'
      ? dueDateValue.slice(0, 10)
      : new Date(dueDateValue).toISOString().slice(0, 10);
    const eligibleForAutomaticFee = String(row.loanPaymentType || '') === 'diario'
      && !client.late_fee_disabled
      && ["pendente", "atrasado"].includes(row.status)
      && dueDate <= clock.today;
    const baseAmount = row.originalAmount != null ? parseFloat(row.originalAmount || 0) : parseFloat(row.amount || 0);
    const storedFee = row.feeApplied != null ? parseFloat(row.feeApplied || 0) : 0;
    let automaticFee = 0;
    if (eligibleForAutomaticFee) {
      const configRows = await qRows(db, drizzleSql\`SELECT * FROM loan_late_fee_config WHERE id=1 LIMIT 1\`);
      automaticFee = calculateLateFeeForInstallment({
        dueDate,
        amount: baseAmount,
        config: configRows[0],
        clock,
      });
    }
    const effectiveFee = Math.max(storedFee, automaticFee);

    if (effectiveFee > 0) {
      const updatedAmount = Math.round((baseAmount + effectiveFee) * 100) / 100;
      const spNow = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      const note = automaticFee > storedFee
        ? \`Taxa diária automática atualizada para +R$ \${effectiveFee.toFixed(2).replace('.', ',')} no envio do comprovante em \${spNow}\`
        : (row.notes || \`Taxa diária: +R$ \${effectiveFee.toFixed(2).replace('.', ',')}\`);
      await db.execute(drizzleSql\`
        UPDATE loanInstallments
        SET amount=\${updatedAmount.toFixed(2)}, originalAmount=\${baseAmount.toFixed(2)},
            feeApplied=\${effectiveFee.toFixed(2)}, notes=\${note}, proofUrl=\${url}, proofSentAt=\${receivedAt}, status='em_analise'
        WHERE id=\${input.installmentId}
      \`);
    } else {
      await db.execute(drizzleSql\`UPDATE loanInstallments SET proofUrl=\${url}, proofSentAt=\${receivedAt}, status='em_analise' WHERE id=\${input.installmentId}\`);
    }

    const h2ScoreSubmission = await registerH2ScoreSubmission(db, {
      installmentId: input.installmentId,
      loanId: Number(row.loanId),
      clientId: Number(client.id),
      dueDate,
      proofUrl: url,
      submittedAt: receivedAt,
    });
    return { ok: true, url, appliedFee: effectiveFee, h2ScoreSubmission };
  }),

  // Simulação de parcelas`,
    'gate comprovante diario',
  );

  s = replaceRequired(
    s,
    /  calcLateFee: publicProcedure\.input\(z\.object\(\{[\s\S]*?\n  \}\),\n\n  \/\/ Ativar\/desativar empréstimo por telefone/,
    `  calcLateFee: publicProcedure.input(z.object({
    token: z.string(),
    installmentId: z.number(),
  })).query(async ({ input }) => {
    const db = await getDb() as any;
    await requireLoanRouteAccess(db, input.token);
    const token = input.token.trim();
    const clients = await qRows(db, drizzleSql\`SELECT * FROM loanClients WHERE spreadsheetToken=\${token}\`);
    if (!clients.length) throw new TRPCError({ code: "UNAUTHORIZED" });
    const client = clients[0];
    if (client.late_fee_disabled) return { lateFee: 0, breakdown: null };

    const cfgRows = await qRows(db, drizzleSql\`SELECT * FROM loan_late_fee_config WHERE id=1 LIMIT 1\`);
    const cfg = cfgRows[0];
    if (!cfg || !cfg.enabled) return { lateFee: 0, breakdown: null };

    const inst = await qRows(db, drizzleSql\`
      SELECT li.*, l.clientId, l.paymentType AS loanPaymentType FROM loanInstallments li
      JOIN loans l ON l.id = li.loanId
      WHERE li.id=\${input.installmentId} AND l.clientId=\${client.id}
    \`);
    if (!inst.length) throw new TRPCError({ code: "NOT_FOUND" });
    const installment = inst[0];
    if (String(installment.loanPaymentType || '') !== 'diario') return { lateFee: 0, breakdown: null };

    const clock = getBrazilClock();
    if (!["pendente", "atrasado"].includes(installment.status) || installment.dueDate > clock.date) {
      return { lateFee: 0, breakdown: null };
    }

    const baseAmount = installment.originalAmount != null ? parseFloat(installment.originalAmount) : parseFloat(installment.amount);
    const storedFee = installment.feeApplied != null ? parseFloat(installment.feeApplied) : 0;
    const requiredFee = calculateLateFeeForInstallment({ dueDate: installment.dueDate, amount: baseAmount, config: cfg, clock });
    const lateFee = Math.max(storedFee, requiredFee);
    const fixedFee = parseFloat(cfg.fee_after_18h || '0') + parseFloat(cfg.fee_after_20h || '0');
    const minuteOfDay = clock.hour * 60 + clock.minute;
    let breakdown: string[] = [];
    if (installment.dueDate < clock.date || minuteOfDay >= 23 * 60 + 59) {
      breakdown = [\`Às 23:59 e depois: maior valor entre R$ \${fixedFee.toFixed(2)} e \${Number(cfg.fee_after_midnight_pct || 0)}% da parcela (taxa: R$ \${lateFee.toFixed(2)})\`];
    } else if (minuteOfDay >= 20 * 60 + 1) {
      breakdown = [\`A partir de 20:01: taxa fixa acumulada de R$ \${lateFee.toFixed(2)}\`];
    } else if (minuteOfDay >= 18 * 60 + 1) {
      breakdown = [\`A partir de 18:01: +R$ \${lateFee.toFixed(2)}\`];
    }
    return { lateFee, totalWithFee: baseAmount + lateFee, breakdown };
  }),

  // Ativar/desativar empréstimo por telefone`,
    'calcLateFee diario',
  );

  s = replaceRequired(
    s,
    /  applyLateFeeToInstallment: adminProcedure\.input\(z\.object\(\{[\s\S]*?\n  \}\),\n\n  \/\/ Remove taxa de atraso/,
    `  applyLateFeeToInstallment: adminProcedure.input(z.object({
    installmentId: z.number(),
    feeAmount: z.number().min(0),
    feeNote: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb() as any;
    const inst = await qRows(db, drizzleSql\`
      SELECT li.*, l.paymentType AS loanPaymentType
      FROM loanInstallments li
      JOIN loans l ON l.id=li.loanId
      WHERE li.id=\${input.installmentId}
      LIMIT 1
    \`);
    if (!inst.length) throw new TRPCError({ code: 'NOT_FOUND', message: 'Parcela não encontrada' });
    const current = inst[0];
    if (current.status === 'pago') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Parcela já está paga' });
    if (String(current.loanPaymentType || '') !== 'diario') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Taxa diária disponível somente em empréstimos com pagamento diário.' });
    }

    // O ADM pode aplicar manualmente a taxa em qualquer data/horário. A janela de
    // 18:01/20:01/23:59 vale somente para a automação do cliente.
    const originalAmount = current.originalAmount != null ? parseFloat(current.originalAmount) : parseFloat(current.amount);
    const newAmount = Math.round((originalAmount + input.feeAmount) * 100) / 100;
    const spNow = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const note = input.feeNote || \`Taxa diária manual: +R$ \${input.feeAmount.toFixed(2).replace('.', ',')} aplicada pelo ADM em \${spNow}\`;
    await db.execute(drizzleSql\`
      UPDATE loanInstallments
      SET amount=\${newAmount.toFixed(2)}, originalAmount=\${originalAmount.toFixed(2)}, feeApplied=\${input.feeAmount.toFixed(2)}, notes=\${note}
      WHERE id=\${input.installmentId}
    \`);
    return { ok: true, originalAmount, feeAmount: input.feeAmount, newAmount };
  }),

  // Remove taxa de atraso`,
    'taxa manual qualquer horario',
  );

  s = replaceRequired(
    s,
    /  autoApplyLateFees: adminProcedure\.mutation\(async \(\) => \{[\s\S]*?\n  \}\),\n\n  \/\/ Busca clientes com score D/,
    `  autoApplyLateFees: adminProcedure.mutation(async () => {
    const db = await getDb() as any;
    const clock = getBrazilClock();
    const cfgRows = await qRows(db, drizzleSql\`SELECT * FROM loan_late_fee_config WHERE id=1 LIMIT 1\`);
    const cfg = cfgRows[0];
    if (!cfg || !cfg.enabled) return { ok: true, applied: 0, message: 'Taxa desativada' };

    // SOMENTE parcelas diárias. Inclui o vencimento de hoje para que 18:01, 20:01
    // e 23:59 possam ser persistidos quando a rotina rodar durante o dia.
    const candidates = await qRows(db, drizzleSql\`
      SELECT li.*, lc.late_fee_disabled, l.paymentType
      FROM loanInstallments li
      JOIN loans l ON l.id = li.loanId
      JOIN loanClients lc ON lc.id = l.clientId
      WHERE li.status IN ('pendente', 'atrasado')
        AND li.dueDate <= \${clock.today}
        AND l.paymentType = 'diario'
        AND l.status NOT IN ('pago', 'cancelado', 'reprovado')
        AND (lc.late_fee_disabled IS NULL OR lc.late_fee_disabled = 0)
    \`);

    let applied = 0;
    for (const inst of candidates) {
      const baseAmount = inst.originalAmount != null ? parseFloat(inst.originalAmount) : parseFloat(inst.amount);
      const storedFee = inst.feeApplied != null ? parseFloat(inst.feeApplied) : 0;
      const requiredFee = calculateLateFeeForInstallment({ dueDate: inst.dueDate, amount: baseAmount, config: cfg, clock });
      // Regra especial: preserva sempre o MAIOR. Taxa manual maior nunca diminui;
      // taxa automática sobe quando a próxima faixa exige valor superior.
      const effectiveFee = Math.max(storedFee, requiredFee);
      if (effectiveFee <= 0 || effectiveFee <= storedFee) continue;
      const newAmount = Math.round((baseAmount + effectiveFee) * 100) / 100;
      const spNow = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      const note = \`Taxa diária automática: +R$ \${effectiveFee.toFixed(2).replace('.', ',')} atualizada em \${spNow}\`;
      await db.execute(drizzleSql\`
        UPDATE loanInstallments
        SET amount=\${newAmount.toFixed(2)}, originalAmount=\${baseAmount.toFixed(2)},
            feeApplied=\${effectiveFee.toFixed(2)}, notes=\${note},
            status=CASE WHEN dueDate < \${clock.today} THEN 'atrasado' ELSE status END
        WHERE id=\${inst.id}
      \`);
      applied++;
    }
    return { ok: true, applied };
  }),

  // Busca clientes com score D`,
    'auto taxa somente diaria e maior valor',
  );

  fs.writeFileSync(file, s);
}

function patchAdminLoans() {
  const file = 'client/src/pages/AdminLoans.tsx';
  let s = fs.readFileSync(file, 'utf8');

  s = replaceRequired(s,
    `    hour: "2-digit",\n    hourCycle: "h23",`,
    `    hour: "2-digit",\n    minute: "2-digit",\n    hourCycle: "h23",`,
    'admin clock minute format');
  s = replaceRequired(s,
    `    hour: Number(valueOf("hour")),\n  };`,
    `    hour: Number(valueOf("hour")),\n    minute: Number(valueOf("minute")),\n  };`,
    'admin clock minute return');

  s = replaceRequired(
    s,
    /  const handleOpenLateFee = useCallback\(\(inst: any, loanId: number\) => \{[\s\S]*?\n  \}, \[\]\);/,
    `  const handleOpenLateFee = useCallback((inst: any, loanId: number) => {
    const dueDate = civilDate(inst.dueDate);
    if (!dueDate) {
      toast.error(\`A parcela #\${inst.installmentNumber} não possui um vencimento válido.\`);
      return;
    }
    // Aplicação manual do ADM não depende da hora nem do vencimento.
    setFeeModal({ inst, loanId });
    setFeeCustomAmount("");
  }, []);`,
    'ADM abre taxa qualquer horario',
  );

  s = replaceRequired(s,
    `            const activeTier = dueDate < clock.date ? "after_midnight" : clock.hour >= 20 ? "after_20" : "after_18";`,
    `            const minuteOfDay = clock.hour * 60 + clock.minute;\n            const activeTier = dueDate < clock.date || minuteOfDay >= 23 * 60 + 59 ? "after_midnight" : minuteOfDay >= 20 * 60 + 1 ? "after_20" : minuteOfDay >= 18 * 60 + 1 ? "after_18" : "before_18";`,
    'faixa visual por minuto');

  s = s.replaceAll('disabled={activeTier !== "after_18" || applyLateFee.isPending}', 'disabled={applyLateFee.isPending}');
  s = s.replaceAll('disabled={activeTier !== "after_20" || applyLateFee.isPending}', 'disabled={applyLateFee.isPending}');
  s = s.replaceAll('disabled={activeTier !== "after_midnight" || applyLateFee.isPending}', 'disabled={applyLateFee.isPending}');
  s = s.replace('Taxa 18h–20h{activeTier === "after_18" ? " (faixa atual)" : ""}', 'Taxa manual R$ 10 (regra 18:01){activeTier === "after_18" ? " · faixa automática atual" : ""}');
  s = s.replace('Taxa 20h–23:59 (acumulada){activeTier === "after_20" ? " (faixa atual)" : ""}', 'Taxa manual acumulada (regra 20:01){activeTier === "after_20" ? " · faixa automática atual" : ""}');
  s = s.replace('Taxa após meia-noite ({feeMidnightPct}%){activeTier === "after_midnight" ? " (faixa atual)" : ""}', 'Taxa manual final (23:59 · maior valor){activeTier === "after_midnight" ? " · faixa automática atual" : ""}');

  fs.writeFileSync(file, s);
}

function patchPublicLoans() {
  const file = 'client/src/pages/LoansTab.tsx';
  let s = fs.readFileSync(file, 'utf8');

  s = replaceRequired(s,
    `function LateFeePanel({ config, installmentAmount }: { config: any; installmentAmount?: number }) {\n  if (!config?.enabled) return null;`,
    `function LateFeePanel({ config, installmentAmount, paymentType }: { config: any; installmentAmount?: number; paymentType?: string }) {\n  if (!config?.enabled || paymentType !== "diario") return null;`,
    'painel taxa somente diaria');
  s = replaceRequired(s, 'Das 18h até 19:59:', 'Das 18:01 até 20:00:', 'texto 18:01');
  s = replaceRequired(s, 'A partir das 20h:', 'Das 20:01 até 23:58:', 'texto 20:01');
  s = replaceRequired(s, 'Após 23:59:', 'Às 23:59 e depois:', 'texto 23:59');
  s = replaceRequired(s,
    'será cobrado somente o maior valor entre R$ {fixedFeeAfter20.toFixed(2)} e o valor da parcela',
    'será cobrado o maior valor entre R$ {fixedFeeAfter20.toFixed(2)} e {parseFloat(config.fee_after_midnight_pct || 0)}% do valor da parcela',
    'texto maior valor');

  s = replaceRequired(s,
    '<LateFeePanel config={lateFeeConfig} />',
    '<LateFeePanel config={lateFeeConfig} paymentType="diario" />',
    'painel informativo sem ativo');
  s = replaceRequired(s,
    '<LateFeePanel config={lateFeeConfig} installmentAmount={totalAmt / Math.max(totalCount, 1)} />',
    '<LateFeePanel config={lateFeeConfig} installmentAmount={totalAmt / Math.max(totalCount, 1)} paymentType={loan.paymentType} />',
    'painel dentro do emprestimo');

  fs.writeFileSync(file, s);
}

patchLoansRouter();
patchAdminLoans();
patchPublicLoans();
console.log('PATCH_DAILY_LATE_FEE_OK');
