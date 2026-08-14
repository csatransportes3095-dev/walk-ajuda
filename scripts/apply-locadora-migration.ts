import { createConnection } from "mysql2/promise";

/** Migration exclusiva do módulo Locadora.
 * Não importa o backup operacional e não toca em nenhuma tabela existente do H2. */
async function run() {
  if (!process.env.DATABASE_URL) {
    console.log("[locadora-migrate] DATABASE_URL não configurada, pulando migration.");
    return;
  }
  const connection = await createConnection(process.env.DATABASE_URL);
  const statements = [
    `CREATE TABLE IF NOT EXISTS locadora_tenants (
      id INT AUTO_INCREMENT PRIMARY KEY, ownerAdminUserId INT NULL, companyName VARCHAR(255) NOT NULL,
      ownerName VARCHAR(255) NULL, cpfCnpj VARCHAR(20) NULL, phone VARCHAR(20) NULL, email VARCHAR(320) NULL,
      address TEXT NULL, city VARCHAR(100) NULL, state VARCHAR(2) NULL, zipCode VARCHAR(10) NULL, whatsapp VARCHAR(20) NULL,
      pixKey TEXT NULL, bankAccount TEXT NULL, logoKey TEXT NULL, plan VARCHAR(32) NOT NULL DEFAULT 'trial',
      planStatus VARCHAR(32) NOT NULL DEFAULT 'trial', trialEndsAt TIMESTAMP NULL, subscriptionEndsAt TIMESTAMP NULL,
      subscriptionPrice DECIMAL(10,2) NULL, lateFeePercent DECIMAL(5,2) NOT NULL DEFAULT 2.00,
      dailyInterestPercent DECIMAL(5,2) NOT NULL DEFAULT 0.03, trialDays INT NOT NULL DEFAULT 7,
      serialCode VARCHAR(64) NULL, serialExpiresAt TIMESTAMP NULL, serialActivatedAt TIMESTAMP NULL,
      isBlocked TINYINT(1) NOT NULL DEFAULT 0, blockReason TEXT NULL, notes TEXT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX locadora_tenants_company_idx (companyName)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS locadora_users (
      id INT AUTO_INCREMENT PRIMARY KEY, tenantId INT NOT NULL, h2UserId INT NULL, name VARCHAR(255) NOT NULL,
      email VARCHAR(320) NULL, phone VARCHAR(20) NULL, role VARCHAR(64) NOT NULL DEFAULT 'manager', status VARCHAR(32) NOT NULL DEFAULT 'active',
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX locadora_users_tenant_idx (tenantId), UNIQUE KEY locadora_users_tenant_email_uq (tenantId, email)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS locadora_clients (
      id INT AUTO_INCREMENT PRIMARY KEY, tenantId INT NOT NULL, fullName VARCHAR(255) NOT NULL,
      cpfCnpj VARCHAR(20) NULL, rg VARCHAR(30) NULL, birthDate DATE NULL, cnh VARCHAR(30) NULL, cnhExpiry DATE NULL,
      phone VARCHAR(20) NULL, whatsapp VARCHAR(20) NULL, email VARCHAR(320) NULL, address TEXT NULL, street VARCHAR(255) NULL,
      addressNumber VARCHAR(20) NULL, neighborhood VARCHAR(100) NULL, city VARCHAR(100) NULL, state VARCHAR(2) NULL, zipCode VARCHAR(10) NULL,
      photoKey TEXT NULL, cnhPhotoKey TEXT NULL, notes TEXT NULL, status VARCHAR(32) NOT NULL DEFAULT 'active', clientRating VARCHAR(4) DEFAULT 'A',
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX locadora_clients_tenant_idx (tenantId), INDEX locadora_clients_tenant_status_idx (tenantId, status), INDEX locadora_clients_tenant_cpf_idx (tenantId, cpfCnpj)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS locadora_vehicles (
      id INT AUTO_INCREMENT PRIMARY KEY, tenantId INT NOT NULL, brand VARCHAR(100) NOT NULL, model VARCHAR(100) NOT NULL, year INT NULL,
      color VARCHAR(50) NULL, plate VARCHAR(10) NOT NULL, renavam VARCHAR(20) NULL, chassis VARCHAR(30) NULL, mileage INT NOT NULL DEFAULT 0,
      dailyPrice DECIMAL(10,2) NULL, weeklyPrice DECIMAL(10,2) NULL, biweeklyPrice DECIMAL(10,2) NULL, monthlyPrice DECIMAL(10,2) NULL,
      licensingDate DATE NULL, insuranceExpiry DATE NULL, insuranceCompany VARCHAR(100) NULL, insurancePolicyNumber VARCHAR(50) NULL,
      nextMaintenanceDate DATE NULL, nextMaintenanceMileage INT NULL, status VARCHAR(32) NOT NULL DEFAULT 'available', notes TEXT NULL,
      photoKeys TEXT NULL, documentKey TEXT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY locadora_vehicles_tenant_plate_uq (tenantId, plate), INDEX locadora_vehicles_tenant_status_idx (tenantId, status)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS locadora_contracts (
      id INT AUTO_INCREMENT PRIMARY KEY, tenantId INT NOT NULL, clientId INT NOT NULL, vehicleId INT NOT NULL, contractNumber VARCHAR(50) NULL,
      startDate DATE NOT NULL, endDate DATE NOT NULL, type VARCHAR(32) NOT NULL, value DECIMAL(10,2) NOT NULL, deposit DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      caucaoStatus VARCHAR(32) NOT NULL DEFAULT 'pending', caucaoPaidAt TIMESTAMP NULL, caucaoReturnedAt TIMESTAMP NULL, startMileage INT NULL, endMileage INT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'active', notes TEXT NULL, pdfKey TEXT NULL, signedContractKey TEXT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX locadora_contracts_tenant_idx (tenantId), INDEX locadora_contracts_tenant_status_idx (tenantId,status), INDEX locadora_contracts_tenant_client_idx (tenantId,clientId), INDEX locadora_contracts_tenant_vehicle_idx (tenantId,vehicleId)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS locadora_charges (
      id INT AUTO_INCREMENT PRIMARY KEY, tenantId INT NOT NULL, contractId INT NULL, clientId INT NOT NULL, vehicleId INT NULL, description VARCHAR(255) NULL,
      amount DECIMAL(10,2) NOT NULL, lateFee DECIMAL(10,2) NOT NULL DEFAULT 0.00, interest DECIMAL(10,2) NOT NULL DEFAULT 0.00, totalAmount DECIMAL(10,2) NOT NULL,
      dueDate DATE NOT NULL, paidAt TIMESTAMP NULL, paidAmount DECIMAL(10,2) NULL, type VARCHAR(32) NOT NULL DEFAULT 'monthly', paymentMethod VARCHAR(32) NOT NULL DEFAULT 'pending',
      status VARCHAR(32) NOT NULL DEFAULT 'pending', receiptKey TEXT NULL, notes TEXT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX locadora_charges_tenant_idx (tenantId), INDEX locadora_charges_tenant_status_idx (tenantId,status), INDEX locadora_charges_tenant_due_idx (tenantId,dueDate)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS locadora_maintenances (
      id INT AUTO_INCREMENT PRIMARY KEY, tenantId INT NOT NULL, vehicleId INT NOT NULL, type VARCHAR(100) NOT NULL, description TEXT NULL,
      cost DECIMAL(10,2) NULL, mileageAtService INT NULL, serviceDate DATE NOT NULL, nextServiceDate DATE NULL, nextServiceMileage INT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'scheduled', notes TEXT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX locadora_maintenances_tenant_vehicle_idx (tenantId,vehicleId)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS locadora_fines (
      id INT AUTO_INCREMENT PRIMARY KEY, tenantId INT NOT NULL, vehicleId INT NOT NULL, clientId INT NULL, contractId INT NULL,
      description TEXT NULL, amount DECIMAL(10,2) NOT NULL, fineDate DATE NOT NULL, dueDate DATE NULL, status VARCHAR(32) NOT NULL DEFAULT 'pending',
      receiptKey TEXT NULL, notes TEXT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX locadora_fines_tenant_status_idx (tenantId,status)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS locadora_employees (
      id INT AUTO_INCREMENT PRIMARY KEY, tenantId INT NOT NULL, name VARCHAR(255) NOT NULL, cpf VARCHAR(14) NULL, phone VARCHAR(20) NULL,
      email VARCHAR(320) NULL, role VARCHAR(100) NULL, commissionPercent DECIMAL(5,2) NOT NULL DEFAULT 0.00, salary DECIMAL(10,2) NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'active', notes TEXT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX locadora_employees_tenant_status_idx (tenantId,status)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS locadora_caucao_installments (
      id INT AUTO_INCREMENT PRIMARY KEY, tenantId INT NOT NULL, contractId INT NOT NULL, clientId INT NOT NULL, installmentNumber INT NOT NULL,
      totalInstallments INT NOT NULL, amount DECIMAL(10,2) NOT NULL, dueDate DATE NOT NULL, paidAt TIMESTAMP NULL, paidAmount DECIMAL(10,2) NULL,
      paymentMethod VARCHAR(32) NOT NULL DEFAULT 'pending', status VARCHAR(32) NOT NULL DEFAULT 'pending', notes TEXT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX locadora_caucao_tenant_contract_idx (tenantId,contractId)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS locadora_alerts (
      id INT AUTO_INCREMENT PRIMARY KEY, tenantId INT NOT NULL, type VARCHAR(64) NOT NULL, title VARCHAR(255) NOT NULL, message TEXT NULL,
      relatedId INT NULL, relatedType VARCHAR(50) NULL, isRead TINYINT(1) NOT NULL DEFAULT 0, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX locadora_alerts_tenant_read_idx (tenantId,isRead)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS locadora_access_logs (
      id INT AUTO_INCREMENT PRIMARY KEY, tenantId INT NULL, userId INT NULL, action VARCHAR(100) NOT NULL, details TEXT NULL,
      ipAddress VARCHAR(45) NULL, userAgent TEXT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX locadora_access_logs_tenant_idx (tenantId)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS locadora_activation_serials (
      id INT AUTO_INCREMENT PRIMARY KEY, tenantId INT NOT NULL, serial VARCHAR(64) NOT NULL, isActive TINYINT(1) NOT NULL DEFAULT 1,
      isUsed TINYINT(1) NOT NULL DEFAULT 0, expiresAt TIMESTAMP NOT NULL, activatedAt TIMESTAMP NULL, notes TEXT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY locadora_activation_serial_uq (serial), INDEX locadora_activation_serial_tenant_idx (tenantId)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS locadora_settings (
      id INT AUTO_INCREMENT PRIMARY KEY, tenantId INT NOT NULL, \`key\` VARCHAR(100) NOT NULL, value TEXT NULL,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY locadora_settings_tenant_key_uq (tenantId, \`key\`)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS locadora_plan_limits (
      id INT AUTO_INCREMENT PRIMARY KEY, planName VARCHAR(50) NOT NULL, maxClients INT NOT NULL DEFAULT 50, maxVehicles INT NOT NULL DEFAULT 20,
      maxActiveContracts INT NOT NULL DEFAULT 20, maxEmployees INT NOT NULL DEFAULT 5,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY locadora_plan_limits_plan_uq (planName)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  ];

  try {
    console.log("[locadora-migrate] Verificando tabelas isoladas da locadora...");
    for (const statement of statements) await connection.query(statement);
    const [dailyPriceColumn] = await connection.query<any[]>(`SHOW COLUMNS FROM locadora_vehicles LIKE 'dailyPrice'`);
    if (!dailyPriceColumn.length) {
      await connection.query(`ALTER TABLE locadora_vehicles ADD COLUMN dailyPrice DECIMAL(10,2) NULL AFTER mileage`);
      console.log("[locadora-migrate] Coluna diária adicionada aos veículos.");
    } else {
      console.log("[locadora-migrate] Coluna diária dos veículos já existe.");
    }
    console.log(`[locadora-migrate] ${statements.length} tabelas verificadas com sucesso.`);
  } catch (error) {
    console.error("[locadora-migrate] Erro:", error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    await connection.end();
  }
}

run().catch((error) => {
  console.error("[locadora-migrate] Falha:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
