import { sql } from "drizzle-orm";

export const H2_SCORE_TIMEZONE = "America/Sao_Paulo";

export type ScoreConfig = {
  onTimePoints: number;
  eveningPoints: number;
  nightPoints: number;
  afterDuePoints: number;
  initialPoints: number;
  bronzeMin: number;
  prataMin: number;
  ouroMin: number;
  diamanteMin: number;
};

type ScoreSubmissionInput = {
  installmentId: number;
  loanId: number;
  clientId: number;
  dueDate: string | Date;
  proofUrl: string;
  submittedAt?: Date;
};

function rows(result: any): any[] {
  return (result?.[0] || result || []) as any[];
}

function brazilDateTime(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: H2_SCORE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "0";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    minutes: Number(value("hour")) * 60 + Number(value("minute")),
  };
}

export async function ensureLoanH2ScoreTables(db: any) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS loanH2ScoreConfig (
      id TINYINT PRIMARY KEY,
      onTimePoints INT NOT NULL DEFAULT 4,
      eveningPoints INT NOT NULL DEFAULT 1,
      nightPoints INT NOT NULL DEFAULT 0,
      afterDuePoints INT NOT NULL DEFAULT -5,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  await db.execute(sql`
    INSERT IGNORE INTO loanH2ScoreConfig (id, onTimePoints, eveningPoints, nightPoints, afterDuePoints)
    VALUES (1, 4, 1, 0, -5)
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS loanH2ScoreSubmissions (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      installmentId BIGINT NOT NULL,
      loanId BIGINT NOT NULL,
      clientId BIGINT NOT NULL,
      proofUrl TEXT NULL,
      submittedAt DATETIME NOT NULL,
      timezone VARCHAR(64) NOT NULL DEFAULT 'America/Sao_Paulo',
      scoreBand VARCHAR(32) NOT NULL,
      proposedPoints INT NOT NULL,
      status ENUM('em_analise','aprovado','recusado') NOT NULL DEFAULT 'em_analise',
      approvedAt DATETIME NULL,
      approvedBy VARCHAR(120) NULL,
      refusedAt DATETIME NULL,
      refusedBy VARCHAR(120) NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_h2score_submission_installment (installmentId, status),
      INDEX idx_h2score_submission_client (clientId, createdAt)
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS loanH2ScoreLedger (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      submissionId BIGINT NOT NULL,
      installmentId BIGINT NOT NULL,
      clientId BIGINT NOT NULL,
      points INT NOT NULL,
      recordedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_h2score_ledger_submission (submissionId),
      INDEX idx_h2score_ledger_client (clientId, recordedAt)
    )
  `);
  // Configuração de níveis: os valores são editáveis no ADM; estes são apenas os padrões aprovados.
  await db.execute(sql`ALTER TABLE loanH2ScoreConfig ADD COLUMN IF NOT EXISTS initialPoints INT NOT NULL DEFAULT 40`);
  await db.execute(sql`ALTER TABLE loanH2ScoreConfig ADD COLUMN IF NOT EXISTS bronzeMin INT NOT NULL DEFAULT 0`);
  await db.execute(sql`ALTER TABLE loanH2ScoreConfig ADD COLUMN IF NOT EXISTS prataMin INT NOT NULL DEFAULT 60`);
  await db.execute(sql`ALTER TABLE loanH2ScoreConfig ADD COLUMN IF NOT EXISTS ouroMin INT NOT NULL DEFAULT 90`);
  await db.execute(sql`ALTER TABLE loanH2ScoreConfig ADD COLUMN IF NOT EXISTS diamanteMin INT NOT NULL DEFAULT 100`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS customerH2ScoreAccounts (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      customerId BIGINT NOT NULL,
      totalPoints INT NOT NULL DEFAULT 40,
      levelSlug VARCHAR(32) NOT NULL DEFAULT 'bronze',
      commercialProfileSlug VARCHAR(32) NULL,
      isCommercialCustom TINYINT(1) NOT NULL DEFAULT 0,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_customer_h2_score_account (customerId),
      INDEX idx_customer_h2_score_level (levelSlug, totalPoints)
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS customerH2ScoreEvents (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      customerId BIGINT NOT NULL,
      loanClientId BIGINT NULL,
      loanId BIGINT NULL,
      installmentId BIGINT NULL,
      submissionId BIGINT NULL,
      eventType ENUM('inicial','pagamento_aprovado','ajuste_manual','migracao') NOT NULL,
      scoreBand VARCHAR(32) NULL,
      pointsBefore INT NOT NULL,
      pointsChange INT NOT NULL,
      pointsAfter INT NOT NULL,
      reason TEXT NOT NULL,
      createdBy VARCHAR(120) NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_customer_h2_score_submission (submissionId),
      INDEX idx_customer_h2_score_event (customerId, createdAt),
      INDEX idx_customer_h2_score_loan_client (loanClientId, createdAt)
    )
  `);
}

export async function getLoanH2ScoreConfig(db: any): Promise<ScoreConfig> {
  await ensureLoanH2ScoreTables(db);
  const config = rows(await db.execute(sql`SELECT * FROM loanH2ScoreConfig WHERE id=1 LIMIT 1`))[0];
  return {
    onTimePoints: Number(config?.onTimePoints ?? 4),
    eveningPoints: Number(config?.eveningPoints ?? 1),
    nightPoints: Number(config?.nightPoints ?? 0),
    afterDuePoints: Number(config?.afterDuePoints ?? -5),
    initialPoints: Number(config?.initialPoints ?? 40),
    bronzeMin: Number(config?.bronzeMin ?? 0),
    prataMin: Number(config?.prataMin ?? 60),
    ouroMin: Number(config?.ouroMin ?? 90),
    diamanteMin: Number(config?.diamanteMin ?? 100),
  };
}

export function classifyH2ScoreAt(dueDate: string | Date, config: ScoreConfig, now = new Date()) {
  const clock = brazilDateTime(now);
  const due = typeof dueDate === "string" ? dueDate.slice(0, 10) : dueDate.toISOString().slice(0, 10);
  if (clock.date > due) return { scoreBand: "apos_vencimento", proposedPoints: config.afterDuePoints };
  if (clock.minutes <= 18 * 60) return { scoreBand: "ate_18h", proposedPoints: config.onTimePoints };
  if (clock.minutes < 20 * 60) return { scoreBand: "apos_18h", proposedPoints: config.eveningPoints };
  return { scoreBand: "apos_20h", proposedPoints: config.nightPoints };
}

export async function registerH2ScoreSubmission(db: any, input: ScoreSubmissionInput) {
  const config = await getLoanH2ScoreConfig(db);
  const submittedAt = input.submittedAt || new Date();
  const classified = classifyH2ScoreAt(input.dueDate, config, submittedAt);
  await db.execute(sql`
    INSERT INTO loanH2ScoreSubmissions
      (installmentId, loanId, clientId, proofUrl, submittedAt, timezone, scoreBand, proposedPoints, status)
    VALUES
      (${input.installmentId}, ${input.loanId}, ${input.clientId}, ${input.proofUrl}, ${submittedAt}, ${H2_SCORE_TIMEZONE}, ${classified.scoreBand}, ${classified.proposedPoints}, 'em_analise')
  `);
  const submission = rows(await db.execute(sql`
    SELECT * FROM loanH2ScoreSubmissions
    WHERE installmentId=${input.installmentId} AND status='em_analise'
    ORDER BY id DESC LIMIT 1
  `))[0];
  return submission;
}

export async function approveH2ScoreSubmission(db: any, installmentId: number, approvedBy: string) {
  await ensureLoanH2ScoreTables(db);
  const submission = rows(await db.execute(sql`
    SELECT * FROM loanH2ScoreSubmissions
    WHERE installmentId=${installmentId} AND status='em_analise'
    ORDER BY id DESC LIMIT 1
  `))[0];
  if (!submission) return null;
  await db.execute(sql`
    UPDATE loanH2ScoreSubmissions
    SET status='aprovado', approvedAt=NOW(), approvedBy=${approvedBy}
    WHERE id=${submission.id} AND status='em_analise'
  `);
  await db.execute(sql`
    INSERT IGNORE INTO loanH2ScoreLedger (submissionId, installmentId, clientId, points)
    VALUES (${submission.id}, ${submission.installmentId}, ${submission.clientId}, ${submission.proposedPoints})
  `);
  return rows(await db.execute(sql`SELECT * FROM loanH2ScoreSubmissions WHERE id=${submission.id} LIMIT 1`))[0];
}

export async function refuseH2ScoreSubmission(db: any, installmentId: number, refusedBy: string) {
  await ensureLoanH2ScoreTables(db);
  await db.execute(sql`
    UPDATE loanH2ScoreSubmissions
    SET status='recusado', refusedAt=NOW(), refusedBy=${refusedBy}
    WHERE installmentId=${installmentId} AND status='em_analise'
  `);
}

export async function getH2ScoreSubmissionMap(db: any, installmentIds: number[]) {
  await ensureLoanH2ScoreTables(db);
  if (!installmentIds.length) return new Map<number, any>();
  const ids = installmentIds.map(Number).filter(Boolean).join(',');
  const submissions = rows(await db.execute(sql`
    SELECT s.* FROM loanH2ScoreSubmissions s
    INNER JOIN (
      SELECT installmentId, MAX(id) AS lastId
      FROM loanH2ScoreSubmissions
      WHERE installmentId IN (${sql.raw(ids)})
      GROUP BY installmentId
    ) latest ON latest.lastId=s.id
  `));
  return new Map(submissions.map((submission: any) => [Number(submission.installmentId), submission]));
}

export async function getClientH2ScoreSummary(db: any, clientIds: number[]) {
  await ensureLoanH2ScoreTables(db);
  const ids = clientIds.map(Number).filter(Boolean).join(',');
  if (!ids) return { totalPoints: 0, approvedEvents: [], pendingEvents: [] };
  const total = rows(await db.execute(sql`
    SELECT COALESCE(SUM(points), 0) AS totalPoints
    FROM loanH2ScoreLedger
    WHERE clientId IN (${sql.raw(ids)})
  `))[0];
  const events = rows(await db.execute(sql`
    SELECT s.id, s.installmentId, s.loanId, s.submittedAt, s.timezone, s.scoreBand, s.proposedPoints,
      s.status, s.approvedAt, s.refusedAt, li.installmentNumber
    FROM loanH2ScoreSubmissions s
    LEFT JOIN loanInstallments li ON li.id=s.installmentId
    WHERE s.clientId IN (${sql.raw(ids)})
    ORDER BY s.createdAt DESC
    LIMIT 8
  `));
  return {
    totalPoints: Number(total?.totalPoints || 0),
    approvedEvents: events.filter((event: any) => event.status === 'aprovado'),
    pendingEvents: events.filter((event: any) => event.status === 'em_analise'),
    recentEvents: events,
  };
}

export function h2ScoreBandLabel(scoreBand: string, points: number) {
  const pointsText = `${points >= 0 ? "+" : ""}${points} pontos`;
  if (scoreBand === "ate_18h") return `Envio até 18h: ${pointsText}`;
  if (scoreBand === "apos_18h") return `Envio após 18h: ${pointsText}`;
  if (scoreBand === "apos_20h") return `Envio após 20h: ${pointsText}`;
  return `Envio após vencimento: ${pointsText}`;
}


export type H2ScoreLevel = {
  slug: "bronze" | "prata" | "ouro" | "diamante";
  label: string;
  icon: string;
  minPoints: number;
  nextLevel: string | null;
  pointsToNext: number;
};

export function clampH2Score(points: number) {
  return Math.max(0, Math.min(100, Math.round(Number(points || 0))));
}

export function getH2ScoreLevel(points: number, config: ScoreConfig): H2ScoreLevel {
  const total = clampH2Score(points);
  if (total >= config.diamanteMin) return { slug: "diamante", label: "Diamante", icon: "💎", minPoints: config.diamanteMin, nextLevel: null, pointsToNext: 0 };
  if (total >= config.ouroMin) return { slug: "ouro", label: "Ouro", icon: "🥇", minPoints: config.ouroMin, nextLevel: "Diamante", pointsToNext: Math.max(0, config.diamanteMin - total) };
  if (total >= config.prataMin) return { slug: "prata", label: "Prata", icon: "🥈", minPoints: config.prataMin, nextLevel: "Ouro", pointsToNext: Math.max(0, config.ouroMin - total) };
  return { slug: "bronze", label: "Bronze", icon: "🥉", minPoints: config.bronzeMin, nextLevel: "Prata", pointsToNext: Math.max(0, config.prataMin - total) };
}

async function resolveMainCustomerForLoanClient(db: any, loanClientId: number) {
  const result = rows(await db.execute(sql`
    SELECT c.id, c.name, c.phone, c.cpf, lc.profileSlug
    FROM loanClients lc
    INNER JOIN customers c ON c.deletedAt IS NULL AND (
      (REGEXP_REPLACE(c.cpf, '[^0-9]', '') <> '' AND REGEXP_REPLACE(c.cpf, '[^0-9]', '') = REGEXP_REPLACE(lc.cpf, '[^0-9]', ''))
      OR REGEXP_REPLACE(c.phone, '[^0-9]', '') = REGEXP_REPLACE(lc.phone, '[^0-9]', '')
    )
    WHERE lc.id=${loanClientId}
    ORDER BY c.id ASC LIMIT 1
  `));
  return result[0] || null;
}

function isCustomProfile(profileSlug: unknown) {
  const value = String(profileSlug || '').toLowerCase();
  return !!value && !['bronze', 'prata', 'ouro', 'diamante'].includes(value);
}

async function getRelatedLoanClientIdsForCustomer(db: any, customerId: number, preferredLoanClientId?: number | null) {
  const customer = rows(await db.execute(sql`SELECT phone, cpf FROM customers WHERE id=${customerId} LIMIT 1`))[0];
  if (!customer) return preferredLoanClientId ? [Number(preferredLoanClientId)] : [];
  const related = rows(await db.execute(sql`
    SELECT id FROM loanClients
    WHERE REGEXP_REPLACE(phone, '[^0-9]', '') = REGEXP_REPLACE(${customer.phone}, '[^0-9]', '')
      OR (REGEXP_REPLACE(cpf, '[^0-9]', '') <> '' AND REGEXP_REPLACE(cpf, '[^0-9]', '') = REGEXP_REPLACE(${customer.cpf}, '[^0-9]', ''))
  `)).map((row: any) => Number(row.id)).filter(Boolean);
  if (preferredLoanClientId && !related.includes(Number(preferredLoanClientId))) related.push(Number(preferredLoanClientId));
  return Array.from(new Set(related));
}

async function syncCommercialProfileFromLevel(db: any, customerId: number, levelSlug: string) {
  const account = rows(await db.execute(sql`SELECT isCommercialCustom FROM customerH2ScoreAccounts WHERE customerId=${customerId} LIMIT 1`))[0];
  if (Number(account?.isCommercialCustom || 0) === 1) return;
  const customer = rows(await db.execute(sql`SELECT phone, cpf FROM customers WHERE id=${customerId} LIMIT 1`))[0];
  if (!customer) return;
  const profile = rows(await db.execute(sql`SELECT * FROM loanProfiles WHERE slug=${levelSlug} AND isActive=1 LIMIT 1`))[0];
  if (!profile) return;
  await db.execute(sql`
    UPDATE loanClients
    SET profileSlug=${levelSlug}, creditLimit=${profile.creditLimit}, interestRate=${profile.interestRate},
        maxDays=${profile.maxDays}, allowedPaymentTypes=${profile.defaultPaymentTypes}, updatedAt=NOW()
    WHERE (REGEXP_REPLACE(phone, '[^0-9]', '') = REGEXP_REPLACE(${customer.phone}, '[^0-9]', '')
      OR (REGEXP_REPLACE(cpf, '[^0-9]', '') <> '' AND REGEXP_REPLACE(cpf, '[^0-9]', '') = REGEXP_REPLACE(${customer.cpf}, '[^0-9]', '')))
      AND profileSlug NOT IN ('personalizado', 'custom')
  `);
}

export async function ensureCustomerH2ScoreAccount(db: any, customerId: number, loanClientId?: number | null) {
  await ensureLoanH2ScoreTables(db);
  const existing = rows(await db.execute(sql`SELECT * FROM customerH2ScoreAccounts WHERE customerId=${customerId} LIMIT 1`))[0];
  if (existing) return existing;
  const config = await getLoanH2ScoreConfig(db);
  const relatedLoanClientIds = await getRelatedLoanClientIdsForCustomer(db, customerId, loanClientId);
  const relatedIdsSql = relatedLoanClientIds.length ? sql.raw(relatedLoanClientIds.join(',')) : sql.raw('0');
  const legacy = rows(await db.execute(sql`
    SELECT COALESCE(SUM(points), 0) AS totalPoints FROM loanH2ScoreLedger WHERE clientId IN (${relatedIdsSql})
  `))[0];
  const loanClients = relatedLoanClientIds.length ? rows(await db.execute(sql`
    SELECT id, profileSlug FROM loanClients WHERE id IN (${relatedIdsSql}) ORDER BY id DESC
  `)) : [];
  const customLoanClient = loanClients.find((row: any) => isCustomProfile(row.profileSlug));
  const initial = clampH2Score(config.initialPoints + Number(legacy?.totalPoints || 0));
  const level = getH2ScoreLevel(initial, config);
  const custom = customLoanClient ? 1 : 0;
  const commercialProfile = custom ? String(customLoanClient?.profileSlug || 'personalizado') : level.slug;
  await db.execute(sql`
    INSERT IGNORE INTO customerH2ScoreAccounts (customerId, totalPoints, levelSlug, commercialProfileSlug, isCommercialCustom)
    VALUES (${customerId}, ${initial}, ${level.slug}, ${commercialProfile}, ${custom})
  `);
  const account = rows(await db.execute(sql`SELECT * FROM customerH2ScoreAccounts WHERE customerId=${customerId} LIMIT 1`))[0];
  const hasInitialEvent = rows(await db.execute(sql`
    SELECT id FROM customerH2ScoreEvents WHERE customerId=${customerId} AND eventType='inicial' LIMIT 1
  `))[0];
  if (!hasInitialEvent) {
    await db.execute(sql`
      INSERT INTO customerH2ScoreEvents (customerId, loanClientId, eventType, pointsBefore, pointsChange, pointsAfter, reason, createdBy)
      VALUES (${customerId}, ${loanClientId || null}, 'inicial', 0, ${initial}, ${initial}, 'Pontuação inicial do H2 Score', 'Sistema')
    `);
  }
  return account;
}

export async function getCustomerH2ScoreSummary(db: any, customerId: number, loanClientId?: number | null) {
  const account = await ensureCustomerH2ScoreAccount(db, customerId, loanClientId);
  const config = await getLoanH2ScoreConfig(db);
  const totalPoints = clampH2Score(Number(account?.totalPoints || 0));
  const level = getH2ScoreLevel(totalPoints, config);
  const events = rows(await db.execute(sql`
    SELECT e.*, li.installmentNumber, l.id AS loanReference
    FROM customerH2ScoreEvents e
    LEFT JOIN loanInstallments li ON li.id=e.installmentId
    LEFT JOIN loans l ON l.id=e.loanId
    WHERE e.customerId=${customerId}
    ORDER BY e.createdAt DESC, e.id DESC
    LIMIT 100
  `));
  const promotionEvent = events.find((event: any) => {
    const beforeLevel = getH2ScoreLevel(Number(event.pointsBefore || 0), config).slug;
    const afterLevel = getH2ScoreLevel(Number(event.pointsAfter || 0), config).slug;
    const rank: Record<string, number> = { bronze: 1, prata: 2, ouro: 3, diamante: 4 };
    return Number(event.pointsChange || 0) > 0 && rank[afterLevel] > rank[beforeLevel];
  }) || null;
  return {
    account: { ...account, totalPoints, levelSlug: level.slug },
    config,
    level,
    events,
    promotionEvent: promotionEvent ? {
      id: promotionEvent.id,
      previousLevel: getH2ScoreLevel(Number(promotionEvent.pointsBefore || 0), config),
      level: getH2ScoreLevel(Number(promotionEvent.pointsAfter || 0), config),
      createdAt: promotionEvent.createdAt,
    } : null,
    currentCommercialProfile: Number(account?.isCommercialCustom || 0) === 1 ? 'personalizado' : level.slug,
  };
}

export async function applyH2ScoreEventFromSubmission(db: any, installmentId: number) {
  await ensureLoanH2ScoreTables(db);
  const submission = rows(await db.execute(sql`
    SELECT * FROM loanH2ScoreSubmissions WHERE installmentId=${installmentId} AND status='aprovado' ORDER BY id DESC LIMIT 1
  `))[0];
  if (!submission) return null;
  const customer = await resolveMainCustomerForLoanClient(db, Number(submission.clientId));
  if (!customer) return null;
  const account = await ensureCustomerH2ScoreAccount(db, Number(customer.id), Number(submission.clientId));
  const alreadyApplied = rows(await db.execute(sql`
    SELECT id FROM customerH2ScoreEvents WHERE submissionId=${submission.id} LIMIT 1
  `))[0];
  if (alreadyApplied) return getCustomerH2ScoreSummary(db, Number(customer.id), Number(submission.clientId));
  const config = await getLoanH2ScoreConfig(db);
  const before = clampH2Score(Number(account.totalPoints || 0));
  const after = clampH2Score(before + Number(submission.proposedPoints || 0));
  const priorLevel = getH2ScoreLevel(before, config);
  const nextLevel = getH2ScoreLevel(after, config);
  const eventInsert = await db.execute(sql`
    INSERT IGNORE INTO customerH2ScoreEvents
      (customerId, loanClientId, loanId, installmentId, submissionId, eventType, scoreBand, pointsBefore, pointsChange, pointsAfter, reason, createdBy)
    VALUES
      (${customer.id}, ${submission.clientId}, ${submission.loanId}, ${submission.installmentId}, ${submission.id}, 'pagamento_aprovado', ${submission.scoreBand}, ${before}, ${submission.proposedPoints}, ${after}, 'Comprovante aprovado pelo ADM', ${submission.approvedBy || 'Administrador'})
  `);
  const inserted = Number((eventInsert as any)?.[0]?.affectedRows ?? (eventInsert as any)?.affectedRows ?? 0) > 0;
  if (inserted) {
    await db.execute(sql`
      UPDATE customerH2ScoreAccounts SET totalPoints=${after}, levelSlug=${nextLevel.slug}, updatedAt=NOW() WHERE customerId=${customer.id}
    `);
    await syncCommercialProfileFromLevel(db, Number(customer.id), nextLevel.slug);
  }
  return { before, after, previousLevel: priorLevel, level: nextLevel, customerId: Number(customer.id) };
}

export async function adjustCustomerH2Score(db: any, input: { customerId: number; loanClientId?: number | null; operation: 'adicionar' | 'remover'; quantity: number; reason: string; adminName: string }) {
  const account = await ensureCustomerH2ScoreAccount(db, input.customerId, input.loanClientId);
  const config = await getLoanH2ScoreConfig(db);
  const before = clampH2Score(Number(account.totalPoints || 0));
  const change = input.operation === 'remover' ? -Math.abs(input.quantity) : Math.abs(input.quantity);
  const after = clampH2Score(before + change);
  const appliedChange = after - before;
  const previousLevel = getH2ScoreLevel(before, config);
  const level = getH2ScoreLevel(after, config);
  await db.execute(sql`
    INSERT INTO customerH2ScoreEvents
      (customerId, loanClientId, eventType, pointsBefore, pointsChange, pointsAfter, reason, createdBy)
    VALUES
      (${input.customerId}, ${input.loanClientId || null}, 'ajuste_manual', ${before}, ${appliedChange}, ${after}, ${input.reason}, ${input.adminName})
  `);
  await db.execute(sql`
    UPDATE customerH2ScoreAccounts SET totalPoints=${after}, levelSlug=${level.slug}, updatedAt=NOW() WHERE customerId=${input.customerId}
  `);
  await syncCommercialProfileFromLevel(db, input.customerId, level.slug);
  return { before, after, change: appliedChange, previousLevel, level };
}

export async function setCustomerCommercialProfileMode(db: any, customerId: number, profileSlug: string, isCustom: boolean) {
  await ensureCustomerH2ScoreAccount(db, customerId);
  await db.execute(sql`
    UPDATE customerH2ScoreAccounts
    SET commercialProfileSlug=${profileSlug}, isCommercialCustom=${isCustom ? 1 : 0}, updatedAt=NOW()
    WHERE customerId=${customerId}
  `);
  if (!isCustom) await syncCommercialProfileFromLevel(db, customerId, profileSlug);
}

export async function getH2ScoreCustomerDirectory(db: any) {
  await ensureLoanH2ScoreTables(db);
  const config = await getLoanH2ScoreConfig(db);
  const customers = rows(await db.execute(sql`
    SELECT c.id AS customerId, c.name, c.phone, c.cpf, c.profilePhotoUrl,
      lc.id AS loanClientId, lc.profileSlug, lc.creditLimit, lc.interestRate,
      (SELECT COUNT(*) FROM loans l WHERE l.clientId=lc.id AND l.status NOT IN ('pago','cancelado','reprovado')) AS activeLoans,
      (SELECT MAX(l2.updatedAt) FROM loans l2 WHERE l2.clientId=lc.id AND l2.status='pago') AS lastSettledAt
    FROM customers c
    LEFT JOIN loanClients lc ON (
      REGEXP_REPLACE(c.phone, '[^0-9]', '')=REGEXP_REPLACE(lc.phone, '[^0-9]', '')
      OR (REGEXP_REPLACE(c.cpf, '[^0-9]', '')<>'' AND REGEXP_REPLACE(c.cpf, '[^0-9]', '')=REGEXP_REPLACE(lc.cpf, '[^0-9]', ''))
    )
    WHERE c.deletedAt IS NULL
    ORDER BY c.createdAt DESC
  `));
  // Um customer pode ter mais de um loanClient legado. A lista segue tendo uma única linha por cadastro principal.
  const grouped = new Map<number, any[]>();
  for (const customer of customers) {
    const id = Number(customer.customerId);
    grouped.set(id, [...(grouped.get(id) || []), customer]);
  }
  const result: any[] = [];
  for (const [customerId, links] of grouped.entries()) {
    const preferred = [...links].sort((a, b) => Number(b.activeLoans || 0) - Number(a.activeLoans || 0))[0];
    const account = await ensureCustomerH2ScoreAccount(db, customerId, preferred?.loanClientId ? Number(preferred.loanClientId) : null);
    const totalPoints = clampH2Score(Number(account.totalPoints || 0));
    const level = getH2ScoreLevel(totalPoints, config);
    const activeLoans = links.reduce((sum, link) => sum + Number(link.activeLoans || 0), 0);
    const lastSettledAt = links.map((link) => link.lastSettledAt).filter(Boolean).sort().at(-1) || null;
    result.push({
      ...preferred,
      customerId,
      activeLoans,
      lastSettledAt,
      totalPoints,
      level,
      commercialProfileSlug: Number(account.isCommercialCustom || 0) === 1 ? String(account.commercialProfileSlug || 'personalizado') : level.slug,
      isCommercialCustom: Number(account.isCommercialCustom || 0) === 1,
      loanSituation: activeLoans > 0 ? 'ativo' : (lastSettledAt ? 'quitado' : 'sem_emprestimo'),
    });
  }
  return result;
}


export async function backfillLegacyH2ScoreEvents(db: any) {
  await ensureLoanH2ScoreTables(db);
  const legacyRows = rows(await db.execute(sql`
    SELECT s.id AS submissionId, s.clientId AS loanClientId, s.loanId, s.installmentId, s.scoreBand,
      s.proposedPoints, s.submittedAt, s.approvedAt, s.approvedBy, l.points,
      c.id AS customerId
    FROM loanH2ScoreSubmissions s
    INNER JOIN loanH2ScoreLedger l ON l.submissionId=s.id
    INNER JOIN loanClients lc ON lc.id=s.clientId
    INNER JOIN customers c ON c.deletedAt IS NULL AND (
      REGEXP_REPLACE(c.phone, '[^0-9]', '')=REGEXP_REPLACE(lc.phone, '[^0-9]', '')
      OR (REGEXP_REPLACE(c.cpf, '[^0-9]', '')<>'' AND REGEXP_REPLACE(c.cpf, '[^0-9]', '')=REGEXP_REPLACE(lc.cpf, '[^0-9]', ''))
    )
    WHERE s.status='aprovado'
    ORDER BY s.id ASC
  `));
  for (const row of legacyRows) {
    const account = await ensureCustomerH2ScoreAccount(db, Number(row.customerId), Number(row.loanClientId));
    const exists = rows(await db.execute(sql`SELECT id FROM customerH2ScoreEvents WHERE submissionId=${row.submissionId} LIMIT 1`))[0];
    if (exists) continue;
    const before = clampH2Score(Number(account.totalPoints || 0) - Number(row.points || 0));
    const after = clampH2Score(Number(account.totalPoints || 0));
    await db.execute(sql`
      INSERT IGNORE INTO customerH2ScoreEvents
        (customerId, loanClientId, loanId, installmentId, submissionId, eventType, scoreBand, pointsBefore, pointsChange, pointsAfter, reason, createdBy, createdAt)
      VALUES
        (${row.customerId}, ${row.loanClientId}, ${row.loanId}, ${row.installmentId}, ${row.submissionId}, 'migracao', ${row.scoreBand}, ${before}, ${row.points}, ${after}, 'Evento H2 Score preservado da implementação anterior', ${row.approvedBy || 'Sistema'}, ${row.approvedAt || row.submittedAt})
    `);
  }
}
