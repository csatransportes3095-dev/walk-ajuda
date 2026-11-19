/**
 * Additive, repeatable migration for multiple order logins.
 * Never updates or deletes the legacy orderLoginData table.
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS orderAdditionalLogins (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        registrationId INT NOT NULL,
        displayOrder INT NOT NULL,
        label VARCHAR(80) NULL,
        customerPhone VARCHAR(32) NOT NULL,
        loginPhone VARCHAR(64) NULL,
        loginEmail VARCHAR(320) NULL,
        loginPassword VARCHAR(256) NULL,
        authCode VARCHAR(512) NULL,
        emailLink VARCHAR(512) NULL,
        cnhCode VARCHAR(6) NULL,
        loginNotes TEXT NULL,
        loginGroupLink VARCHAR(1024) NULL,
        authenticatorQrStorageKey VARCHAR(512) NULL,
        authenticatorQrMimeType VARCHAR(64) NULL,
        authenticatorQrUpdatedAt TIMESTAMP NULL,
        releasedToClient INT NOT NULL DEFAULT 0,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_order_additional_logins_registration (registrationId, displayOrder)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await connection.query(`
      CREATE TABLE IF NOT EXISTS orderLoginReleaseSettings (
        registrationId INT NOT NULL PRIMARY KEY,
        primaryLoginReleased INT NOT NULL DEFAULT 0,
        selectionConfirmedAt TIMESTAMP NULL,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('Multi-login tables ready; legacy logins unchanged.');
  } finally {
    await connection.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
