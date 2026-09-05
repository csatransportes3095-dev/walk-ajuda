import { createConnection } from 'mysql2/promise';

const ROUTES = ['site', 'acompanhar', 'gastos', 'emprestimo'] as const;
const RUN_KEY = 'bulk_activate_all_main_customers_20260905_v1';

function digits(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

function sameIdentity(a: any, b: any): boolean {
  const aCpf = digits(a?.cpf);
  const bCpf = digits(b?.cpf);
  if (aCpf.length === 11 && bCpf.length === 11 && aCpf === bCpf) return true;
  const aPhone = digits(a?.phone);
  const bPhone = digits(b?.phone);
  if (!aPhone || !bPhone) return false;
  return aPhone === bPhone || aPhone.endsWith(bPhone) || bPhone.endsWith(aPhone);
}

async function run() {
  if (!process.env.DATABASE_URL) {
    console.log('[bulk-activate] DATABASE_URL não configurada; nada foi alterado.');
    return;
  }

  const db = await createConnection(process.env.DATABASE_URL);
  let transaction = false;

  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS bulkActivationAudit20260905 (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        customerId BIGINT NOT NULL,
        customerName VARCHAR(255) NULL,
        spreadsheetClientId BIGINT NULL,
        spreadsheetCreated TINYINT(1) NOT NULL DEFAULT 0,
        spreadsheetPreviousStatus VARCHAR(32) NULL,
        spreadsheetPreviousRoutes VARCHAR(255) NULL,
        loanClientId BIGINT NULL,
        loanCreated TINYINT(1) NOT NULL DEFAULT 0,
        loanPreviousEnabled INT NULL,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_bulk_activation_customer_20260905 (customerId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS bulkActivationRouteBackup20260905 (
        customerId BIGINT NOT NULL,
        route VARCHAR(32) NOT NULL,
        status VARCHAR(32) NULL,
        grantedBy VARCHAR(255) NULL,
        grantedAt DATETIME NULL,
        updatedAt DATETIME NULL,
        PRIMARY KEY (customerId, route)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const [already] = await db.query<any[]>(
      'SELECT settingValue FROM siteSettings WHERE settingKey=? LIMIT 1',
      [RUN_KEY],
    );
    if (already.length && String(already[0]?.settingValue || '') === 'done') {
      console.log('[bulk-activate] Rotina já executada anteriormente; pulando.');
      return;
    }

    const [customersRaw] = await db.query<any[]>(`
      SELECT id, customerNumber, name, phone, cpf, blocked, deletedAt
      FROM customers
      WHERE deletedAt IS NULL
      ORDER BY id ASC
    `);
    const [spreadsheetRaw] = await db.query<any[]>(`
      SELECT id, name, phone, cpf, status, allowedRoutes
      FROM spreadsheetClients
      ORDER BY id ASC
    `);
    const [loanRaw] = await db.query<any[]>(`
      SELECT id, name, phone, cpf, status, profileSlug, creditLimit, interestRate,
             maxDays, loanEnabled, allowedPaymentTypes
      FROM loanClients
      ORDER BY id ASC
    `);
    const [bronzeRaw] = await db.query<any[]>(`
      SELECT * FROM loanProfiles WHERE slug='bronze' AND isActive=1 LIMIT 1
    `);

    const bronze = bronzeRaw[0] || {};
    const defaultLimit = Number(bronze.creditLimit || 500);
    const defaultRate = Number(bronze.interestRate || 40);
    const defaultMaxDays = Number(bronze.maxDays || 30);
    const defaultTypes = String(bronze.defaultPaymentTypes || 'diario');

    let spreadsheetCreated = 0;
    let spreadsheetActivated = 0;
    let loanCreated = 0;
    let loanActivated = 0;
    let routesGranted = 0;
    let pendingApproved = 0;
    let restrictionsCleared = 0;

    await db.beginTransaction();
    transaction = true;

    for (const customer of customersRaw) {
      const customerId = Number(customer.id);
      if (!customerId) continue;

      const [routeRows] = await db.query<any[]>(
        'SELECT route, status, grantedBy, grantedAt, updatedAt FROM customerRoutePermissions WHERE customerId=?',
        [customerId],
      );
      for (const routeRow of routeRows) {
        await db.query(`
          INSERT IGNORE INTO bulkActivationRouteBackup20260905
            (customerId, route, status, grantedBy, grantedAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [customerId, routeRow.route, routeRow.status || null, routeRow.grantedBy || null, routeRow.grantedAt || null, routeRow.updatedAt || null]);
      }

      let spreadsheet = spreadsheetRaw.find((row) => sameIdentity(row, customer));
      const spreadsheetPreviousStatus = spreadsheet?.status != null ? String(spreadsheet.status) : null;
      const spreadsheetPreviousRoutes = spreadsheet?.allowedRoutes != null ? String(spreadsheet.allowedRoutes) : null;
      let spreadsheetWasCreated = 0;

      if (!spreadsheet) {
        const [result]: any = await db.query(`
          INSERT INTO spreadsheetClients (phone, name, cpf, status, allowedRoutes, createdAt, updatedAt)
          VALUES (?, ?, ?, 'active', 'gastos,emprestimo', NOW(), NOW())
        `, [digits(customer.phone) || null, String(customer.name || 'CLIENTE'), digits(customer.cpf) || null]);
        spreadsheet = {
          id: Number(result.insertId),
          phone: digits(customer.phone) || null,
          cpf: digits(customer.cpf) || null,
          status: 'active',
          allowedRoutes: 'gastos,emprestimo',
        };
        spreadsheetRaw.push(spreadsheet);
        spreadsheetWasCreated = 1;
        spreadsheetCreated++;
      } else if (String(spreadsheet.status || '') !== 'active' || String(spreadsheet.allowedRoutes || '') !== 'gastos,emprestimo') {
        await db.query(`
          UPDATE spreadsheetClients
          SET status='active', allowedRoutes='gastos,emprestimo', updatedAt=NOW()
          WHERE id=?
        `, [spreadsheet.id]);
        spreadsheet.status = 'active';
        spreadsheet.allowedRoutes = 'gastos,emprestimo';
        spreadsheetActivated++;
      }

      let loan = loanRaw.find((row) => sameIdentity(row, customer));
      const loanPreviousEnabled = loan?.loanEnabled != null ? Number(loan.loanEnabled) : null;
      let loanWasCreated = 0;

      if (!loan) {
        const [result]: any = await db.query(`
          INSERT INTO loanClients
            (userId, name, cpf, phone, status, profileSlug, creditLimit, interestRate, maxDays,
             loanEnabled, allowedPaymentTypes, createdAt, updatedAt)
          VALUES
            (1, ?, ?, ?, 'ativo', 'bronze', ?, ?, ?, 1, ?, NOW(), NOW())
        `, [
          String(customer.name || 'CLIENTE'),
          digits(customer.cpf) || null,
          digits(customer.phone) || null,
          defaultLimit,
          defaultRate,
          defaultMaxDays,
          defaultTypes,
        ]);
        loan = {
          id: Number(result.insertId),
          phone: digits(customer.phone) || null,
          cpf: digits(customer.cpf) || null,
          loanEnabled: 1,
        };
        loanRaw.push(loan);
        loanWasCreated = 1;
        loanCreated++;
      } else if (Number(loan.loanEnabled || 0) !== 1) {
        // Não altera status financeiro, perfil, limite, taxa, prazo, PIX ou formas de pagamento.
        await db.query('UPDATE loanClients SET loanEnabled=1, updatedAt=NOW() WHERE id=?', [loan.id]);
        loan.loanEnabled = 1;
        loanActivated++;
      }

      await db.query(`
        INSERT IGNORE INTO bulkActivationAudit20260905
          (customerId, customerName, spreadsheetClientId, spreadsheetCreated,
           spreadsheetPreviousStatus, spreadsheetPreviousRoutes,
           loanClientId, loanCreated, loanPreviousEnabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        customerId,
        String(customer.name || ''),
        spreadsheet?.id || null,
        spreadsheetWasCreated,
        spreadsheetPreviousStatus,
        spreadsheetPreviousRoutes,
        loan?.id || null,
        loanWasCreated,
        loanPreviousEnabled,
      ]);

      for (const route of ROUTES) {
        const [result]: any = await db.query(`
          INSERT INTO customerRoutePermissions
            (customerId, route, status, grantedBy, grantedAt, updatedAt)
          VALUES (?, ?, 'approved', 'Ativação geral ADM 05/09/2026', NOW(), NOW())
          ON DUPLICATE KEY UPDATE
            status='approved', grantedBy='Ativação geral ADM 05/09/2026', grantedAt=NOW(), updatedAt=NOW()
        `, [customerId, route]);
        if (Number(result.affectedRows || 0) > 0) routesGranted++;
      }

      const [restrictionResult]: any = await db.query(
        'DELETE FROM customerRouteRestrictionReasons WHERE customerId=?',
        [customerId],
      );
      restrictionsCleared += Number(restrictionResult.affectedRows || 0);

      const [pendingResult]: any = await db.query(`
        UPDATE customerAccessRequests
        SET status='approved', pendingKey=NULL, analyzedAt=NOW(), analyzedBy='Ativação geral ADM 05/09/2026'
        WHERE customerId=? AND status='pending'
      `, [customerId]);
      pendingApproved += Number(pendingResult.affectedRows || 0);
    }

    await db.query(`
      INSERT INTO siteSettings (settingKey, settingValue)
      VALUES (?, 'done')
      ON DUPLICATE KEY UPDATE settingValue='done'
    `, [RUN_KEY]);

    await db.commit();
    transaction = false;

    console.log(
      `[bulk-activate] Concluído. principais=${customersRaw.length} ` +
      `gastos_criados=${spreadsheetCreated} gastos_reativados=${spreadsheetActivated} ` +
      `emprestimos_criados=${loanCreated} emprestimos_reativados=${loanActivated} ` +
      `rotas_processadas=${routesGranted} pendencias_aprovadas=${pendingApproved} ` +
      `restricoes_removidas=${restrictionsCleared}`,
    );
  } catch (error) {
    if (transaction) {
      try { await db.rollback(); } catch { /* best effort */ }
    }
    console.error('[bulk-activate] Falha:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

void run();
