from pathlib import Path
import re


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: esperado 1 trecho, encontrado {count}")
    return source.replace(old, new, 1)


def regex_once(source: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, source, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{label}: esperado 1 trecho, encontrado {count}")
    return updated


def patch_infra() -> None:
    path = Path("server/_core/index.ts")
    source = path.read_text(encoding="utf-8")

    source = replace_once(source, 'import net from "net";\n', '', 'infra remove net import')
    source = regex_once(
        source,
        r'function isPortAvailable\(port: number\): Promise<boolean> \{.*?\n\}\n\nasync function findAvailablePort\(startPort: number = 3000\): Promise<number> \{.*?\n\}\n\n',
        '',
        'infra remove port scanner',
    )
    source = replace_once(
        source,
        '''  const preferredPort = Number(process.env.PORT || 3000);\n  const port = await findAvailablePort(preferredPort);\n  server.listen(port, () => {\n    console.log(`Server running on http://localhost:${port}/`);\n  });''',
        '''  const port = Number.parseInt(process.env.PORT || "3000", 10);\n  if (!Number.isInteger(port) || port < 1 || port > 65535) {\n    throw new Error("Invalid PORT configuration");\n  }\n\n  server.once("error", (error) => {\n    console.error("[Server] failed to listen on configured PORT:", error);\n    scheduleFatalProcessExit();\n  });\n\n  server.listen(port, "0.0.0.0", () => {\n    console.log(`Server running on http://0.0.0.0:${port}/`);\n  });''',
        'infra Render PORT binding',
    )

    forbidden = [
        'import net from "net"',
        'function isPortAvailable',
        'function findAvailablePort',
        '/api/zoho-test-session',
        'TEST_walk1',
    ]
    for item in forbidden:
        if item in source:
            raise SystemExit(f"infra: trecho inseguro/legado ainda presente: {item}")

    required = [
        'server.listen(port, "0.0.0.0"',
        'server.once("error"',
        'scheduleFatalProcessExit();',
        'Number.parseInt(process.env.PORT || "3000", 10)',
    ]
    for item in required:
        if item not in source:
            raise SystemExit(f"infra: protecao ausente: {item}")

    path.write_text(source, encoding="utf-8")


def patch_h2ads_privacy() -> None:
    path = Path("workers/windows/browser-session.mjs")
    source = path.read_text(encoding="utf-8")

    source = replace_once(
        source,
        'import { existsSync, readFileSync, writeFileSync } from "node:fs";',
        'import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";',
        'h2ads mkdir import',
    )
    source = replace_once(
        source,
        'const labelPagePath = join(profileDirectory, "h2ads-instance-label.html");',
        'const labelPagePath = join(profileDirectory, "h2ads-instance-label.html");\nconst privacyExtensionDirectory = join(profileDirectory, "h2ads-privacy-extension");',
        'h2ads privacy extension path',
    )

    guard = r'''
function createGoogleSorryPrivacyGuard() {
  mkdirSync(privacyExtensionDirectory, { recursive: true });

  const manifest = {
    manifest_version: 3,
    name: "H2ADS Privacy Guard",
    version: "1.0.0",
    description: "Oculta paginas de bloqueio que exibem informacoes de rede.",
    permissions: ["declarativeNetRequest"],
    host_permissions: ["*://*.google.com/*", "*://*.google.com.br/*"],
    declarative_net_request: {
      rule_resources: [{ id: "privacy_rules", enabled: true, path: "rules.json" }],
    },
  };

  const rules = [
    {
      id: 1,
      priority: 100,
      action: { type: "redirect", redirect: { extensionPath: "/blocked.html" } },
      condition: {
        regexFilter: "^https?://([^/]+\\.)?google\\.com/sorry(?:[/?#].*)?$",
        resourceTypes: ["main_frame"],
      },
    },
    {
      id: 2,
      priority: 100,
      action: { type: "redirect", redirect: { extensionPath: "/blocked.html" } },
      condition: {
        regexFilter: "^https?://([^/]+\\.)?google\\.com\\.br/sorry(?:[/?#].*)?$",
        resourceTypes: ["main_frame"],
      },
    },
  ];

  const blockedHtml = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>H2ADS · Protecao de rede</title><style>html,body{margin:0;min-height:100%;font-family:Arial,sans-serif;background:#0b1220;color:#e5eefc}main{min-height:100vh;display:grid;place-items:center;padding:32px;box-sizing:border-box}section{max-width:700px;text-align:center;border:1px solid #23324d;border-radius:20px;padding:36px;background:#101b2e}small{color:#7dd3fc;font-weight:700;letter-spacing:.14em}h1{font-size:30px;margin:12px 0}p{color:#a9bad3;line-height:1.5;margin:0}</style></head><body><main><section><small>H2ADS · PRIVACY GUARD</small><h1>Conexao em verificacao</h1><p>Esta pagina foi ocultada para proteger os dados de rede da instancia. Nenhum endereco IP, usuario, senha, host ou porta do proxy e exibido aqui.</p></section></main></body></html>`;

  writeFileSync(join(privacyExtensionDirectory, "manifest.json"), JSON.stringify(manifest, null, 2), { encoding: "utf8", mode: 0o600 });
  writeFileSync(join(privacyExtensionDirectory, "rules.json"), JSON.stringify(rules, null, 2), { encoding: "utf8", mode: 0o600 });
  writeFileSync(join(privacyExtensionDirectory, "blocked.html"), blockedHtml, { encoding: "utf8", mode: 0o600 });
  return privacyExtensionDirectory;
}
'''.strip()

    source = replace_once(
        source,
        '\nasync function rotateRelay() {',
        '\n' + guard + '\n\nasync function rotateRelay() {',
        'h2ads privacy guard function',
    )
    source = replace_once(
        source,
        '    const labelPageUrl = createInstanceLabelPage();\n    browser = spawn(executable, [',
        '    const labelPageUrl = createInstanceLabelPage();\n    const privacyGuardExtension = createGoogleSorryPrivacyGuard();\n    browser = spawn(executable, [',
        'h2ads create privacy extension',
    )
    source = replace_once(
        source,
        '      "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",\n      "--no-first-run",',
        '      "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",\n      `--load-extension=${privacyGuardExtension}`,\n      "--no-first-run",',
        'h2ads load privacy extension',
    )
    source = replace_once(
        source,
        '    writeSession({ startedAt: new Date().toISOString(), instanceLabelState: "static_tab", observedIp: initialIp, privacyGuard: "protected" });',
        '    writeSession({ startedAt: new Date().toISOString(), instanceLabelState: "static_tab", observedIp: initialIp, privacyGuard: "protected", googleSorryPrivacyGuard: "enabled" });',
        'h2ads session privacy flag',
    )

    required = [
        'createGoogleSorryPrivacyGuard()',
        'declarativeNetRequest',
        'google\\.com/sorry',
        'google\\.com\\.br/sorry',
        '`--load-extension=${privacyGuardExtension}`',
        'googleSorryPrivacyGuard: "enabled"',
    ]
    for item in required:
        if item not in source:
            raise SystemExit(f"h2ads: protecao ausente: {item}")

    path.write_text(source, encoding="utf-8")


def patch_daily_fee_hardening() -> None:
    router = Path("server/routers/loans.ts")
    source = router.read_text(encoding="utf-8")

    source = replace_once(
        source,
        'SELECT li.*, l.id as loanId FROM loanInstallments li',
        'SELECT li.*, l.id as loanId, l.paymentType AS loanPaymentType FROM loanInstallments li',
        'loans next installment payment type',
    )
    source = replace_once(
        source,
        '      nextInstallment = nextInsts[0] || null;\n',
        '''      nextInstallment = nextInsts[0] || null;\n      if (nextInstallment && String(nextInstallment.loanPaymentType || '') === 'diario' && !client.late_fee_disabled) {\n        const nextFeeConfigRows = await qRows(db, drizzleSql`SELECT * FROM loan_late_fee_config WHERE id=1 LIMIT 1`);\n        const nextBaseAmount = nextInstallment.originalAmount != null ? Number(nextInstallment.originalAmount || 0) : Number(nextInstallment.amount || 0);\n        const nextStoredFee = Number(nextInstallment.feeApplied || 0);\n        const nextAutomaticFee = calculateLateFeeForInstallment({\n          dueDate: nextInstallment.dueDate,\n          amount: nextBaseAmount,\n          config: nextFeeConfigRows[0],\n          clock: getBrazilClock(),\n        });\n        const nextEffectiveFee = Math.max(nextStoredFee, nextAutomaticFee);\n        if (nextEffectiveFee > 0) {\n          nextInstallment = {\n            ...nextInstallment,\n            amount: Math.round((nextBaseAmount + nextEffectiveFee) * 100) / 100,\n            originalAmount: nextBaseAmount.toFixed(2),\n            feeApplied: nextEffectiveFee.toFixed(2),\n            lateFeePreview: nextAutomaticFee > nextStoredFee,\n          };\n        }\n      }\n''',
        'loans next installment effective fee',
    )

    source = regex_once(
        source,
        r'''    // O ADM pode aplicar manualmente a taxa em qualquer data/horário\..*?    return \{ ok: true, originalAmount, feeAmount: input\.feeAmount, newAmount \};''',
        '''    // O ADM pode aplicar manualmente a taxa em qualquer data/horário.\n    // Mesmo no manual, nunca e permitido reduzir uma taxa automatica valida ou uma taxa ja gravada.\n    const originalAmount = current.originalAmount != null ? parseFloat(current.originalAmount) : parseFloat(current.amount);\n    const storedFee = current.feeApplied != null ? parseFloat(current.feeApplied) : 0;\n    const cfgRows = await qRows(db, drizzleSql`SELECT * FROM loan_late_fee_config WHERE id=1 LIMIT 1`);\n    const automaticFee = calculateLateFeeForInstallment({\n      dueDate: current.dueDate,\n      amount: originalAmount,\n      config: cfgRows[0],\n      clock: getBrazilClock(),\n    });\n    const effectiveFee = Math.max(storedFee, input.feeAmount, automaticFee);\n    const newAmount = Math.round((originalAmount + effectiveFee) * 100) / 100;\n    const spNow = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });\n    const note = input.feeNote || `Taxa diaria manual: +R$ ${effectiveFee.toFixed(2).replace('.', ',')} aplicada pelo ADM em ${spNow}`;\n    await db.execute(drizzleSql`\n      UPDATE loanInstallments\n      SET amount=${newAmount.toFixed(2)}, originalAmount=${originalAmount.toFixed(2)}, feeApplied=${effectiveFee.toFixed(2)}, notes=${note}\n      WHERE id=${input.installmentId}\n    `);\n    return { ok: true, originalAmount, feeAmount: effectiveFee, newAmount };''',
        'loans manual fee maximum',
    )

    get_loan_pattern = r'''  getLoan: adminProcedure\.input\(z\.object\(\{ id: z\.number\(\) \}\)\)\.query\(async \(\{ input \}\) => \{.*?\n  \}\),\n\n  createLoan:'''
    get_loan_replacement = '''  getLoan: adminProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {\n    const db = await getDb() as any;\n    const rows = await qRows(db, drizzleSql`\n      SELECT l.*, lc.name as clientName, lc.phone as clientPhone, lc.cpf as clientCpf,\n        lc.late_fee_disabled as clientLateFeeDisabled\n      FROM loans l JOIN loanClients lc ON lc.id = l.clientId WHERE l.id=${input.id}\n    `);\n    if (!rows.length) throw new TRPCError({ code: "NOT_FOUND" });\n    const clock = getBrazilClock();\n    const rawInstallments = await qRows(db, drizzleSql`SELECT * FROM loanInstallments WHERE loanId=${input.id} ORDER BY installmentNumber ASC`);\n    const scoreByInstallment = await getH2ScoreSubmissionMap(db, rawInstallments.map((i: any) => Number(i.id)));\n    const configRows = await qRows(db, drizzleSql`SELECT * FROM loan_late_fee_config WHERE id=1 LIMIT 1`);\n    const lateFeeConfig = configRows[0];\n    const isDailyLoan = String(rows[0].paymentType || '') === 'diario';\n    const instRows = rawInstallments.map((i: any) => {\n      const baseAmount = i.originalAmount != null ? Number(i.originalAmount || 0) : Number(i.amount || 0);\n      const storedFee = i.feeApplied != null ? Number(i.feeApplied || 0) : 0;\n      const canCalculateAutomaticFee = isDailyLoan\n        && !rows[0].clientLateFeeDisabled\n        && ['pendente', 'atrasado'].includes(i.status);\n      const automaticFee = canCalculateAutomaticFee\n        ? calculateLateFeeForInstallment({ dueDate: i.dueDate, amount: baseAmount, config: lateFeeConfig, clock })\n        : 0;\n      const effectiveFee = isDailyLoan ? Math.max(storedFee, automaticFee) : 0;\n      const effectiveAmount = effectiveFee > 0\n        ? Math.round((baseAmount + effectiveFee) * 100) / 100\n        : i.amount;\n      return {\n        ...i,\n        amount: effectiveAmount,\n        ...(isDailyLoan && effectiveFee > 0 ? {\n          originalAmount: baseAmount.toFixed(2),\n          feeApplied: effectiveFee.toFixed(2),\n          lateFeePreview: automaticFee > storedFee,\n        } : {}),\n        h2ScoreSubmission: scoreByInstallment.get(Number(i.id)) || null,\n        isOverdue: !['pago', 'cancelado', 'reprovado', 'em_analise'].includes(i.status) && i.dueDate < clock.today,\n      };\n    });\n    const h2Score = await getClientH2ScoreSummary(db, [Number(rows[0].clientId)]);\n    return { ...rows[0], installments: instRows, h2Score };\n  }),\n\n  createLoan:'''
    source = regex_once(source, get_loan_pattern, get_loan_replacement, 'loans ADM preview central formula')

    required = [
        "String(row.loanPaymentType || '') === 'diario'",
        "String(installment.loanPaymentType || '') !== 'diario'",
        "AND l.paymentType = 'diario'",
        "Math.max(storedFee, input.feeAmount, automaticFee)",
        "Math.max(nextStoredFee, nextAutomaticFee)",
        "const isDailyLoan = String(rows[0].paymentType || '') === 'diario';",
        "const effectiveFee = isDailyLoan ? Math.max(storedFee, automaticFee) : 0;",
        "lc.late_fee_disabled as clientLateFeeDisabled",
    ]
    for item in required:
        if item not in source:
            raise SystemExit(f"loans: invariante ausente: {item}")
    if 'isLateFeeWindowOpen' in source:
        raise SystemExit('loans: regra antiga isLateFeeWindowOpen ainda presente')

    router.write_text(source, encoding="utf-8")

    admin = Path("client/src/pages/AdminLoans.tsx")
    ui = admin.read_text(encoding="utf-8")
    old_midnight = 'const feeMidnight = Math.round(originalAmt * (feeMidnightPct / 100) * 100) / 100;'
    ui = replace_once(
        ui,
        old_midnight,
        'const feeMidnight = Math.max(feeTotal18_20, Math.round(originalAmt * (feeMidnightPct / 100) * 100) / 100);',
        'admin midnight maximum',
    )
    overdue_marker = ') : inst.isOverdue ? ('
    count = ui.count(overdue_marker)
    if count != 2:
        raise SystemExit(f"admin +Taxa: esperado 2 marcadores, encontrado {count}")
    ui = ui.replace(overdue_marker, ') : loan.paymentType === "diario" ? (')
    admin.write_text(ui, encoding="utf-8")


patch_infra()
patch_h2ads_privacy()
patch_daily_fee_hardening()
print("PROD_HARDENING_PATCH_OK")
