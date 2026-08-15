import { sql } from "drizzle-orm";

export const H2_SCORE_TIMEZONE = "America/Sao_Paulo";

type ScoreConfig = {
  onTimePoints: number;
  eveningPoints: number;
  nightPoints: number;
  afterDuePoints: number;
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
}

export async function getLoanH2ScoreConfig(db: any): Promise<ScoreConfig> {
  await ensureLoanH2ScoreTables(db);
  const config = rows(await db.execute(sql`SELECT * FROM loanH2ScoreConfig WHERE id=1 LIMIT 1`))[0];
  return {
    onTimePoints: Number(config?.onTimePoints ?? 4),
    eveningPoints: Number(config?.eveningPoints ?? 1),
    nightPoints: Number(config?.nightPoints ?? 0),
    afterDuePoints: Number(config?.afterDuePoints ?? -5),
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
