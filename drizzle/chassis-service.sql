-- Módulo independente. Não altera customers, pedidos, senhas ou sessões centrais.
CREATE TABLE IF NOT EXISTS h2_chassis_users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL DEFAULT '',
  phone VARCHAR(15) NOT NULL,
  password_hash VARCHAR(256) NOT NULL,
  account_type ENUM('test','paid') NOT NULL DEFAULT 'test',
  status ENUM('active','blocked') NOT NULL DEFAULT 'active',
  balance INT UNSIGNED NOT NULL DEFAULT 0,
  total_used INT UNSIGNED NOT NULL DEFAULT 0,
  session_version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY chassis_phone_unique (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS h2_chassis_sessions (
  token_hash CHAR(64) NOT NULL PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  session_version INT UNSIGNED NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY chassis_session_user (user_id),
  KEY chassis_session_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS h2_chassis_settings (
  id INT UNSIGNED NOT NULL PRIMARY KEY,
  trial_credits INT UNSIGNED NOT NULL DEFAULT 0,
  registration_enabled TINYINT(1) NOT NULL DEFAULT 1,
  support_phone VARCHAR(15) NOT NULL DEFAULT '',
  pix_key VARCHAR(256) NOT NULL DEFAULT '',
  pix_name VARCHAR(160) NOT NULL DEFAULT '',
  pix_bank VARCHAR(120) NOT NULL DEFAULT '',
  payment_instructions TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO h2_chassis_settings (id, payment_instructions) VALUES (1, '');

CREATE TABLE IF NOT EXISTS h2_chassis_packages (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(80) NOT NULL,
  credits INT UNSIGNED NOT NULL,
  price_cents INT UNSIGNED NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS h2_chassis_purchases (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  package_id INT UNSIGNED NOT NULL,
  package_title VARCHAR(80) NOT NULL,
  credits INT UNSIGNED NOT NULL,
  price_cents INT UNSIGNED NOT NULL,
  status ENUM('pending','approved','cancelled') NOT NULL DEFAULT 'pending',
  proof_status ENUM('none','submitted','rejected') NOT NULL DEFAULT 'none',
  proof_url VARCHAR(1024) NULL,
  proof_key VARCHAR(512) NULL,
  proof_mime VARCHAR(100) NULL,
  proof_submitted_at DATETIME NULL,
  confirmed_by VARCHAR(128) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at DATETIME NULL,
  KEY chassis_purchase_user (user_id, created_at),
  KEY chassis_purchase_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS h2_chassis_generations (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  input_hash CHAR(64) NOT NULL,
  results JSON NOT NULL,
  marca VARCHAR(120) NOT NULL,
  modelo VARCHAR(160) NOT NULL,
  year_code CHAR(1) NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY chassis_generation_user (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS h2_chassis_credit_ledger (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  kind VARCHAR(32) NOT NULL,
  delta INT NOT NULL,
  balance_after INT UNSIGNED NOT NULL,
  reference_id VARCHAR(48) NULL,
  actor VARCHAR(128) NOT NULL,
  note VARCHAR(300) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY chassis_ledger_user (user_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS h2_chassis_audit_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NULL,
  action VARCHAR(32) NOT NULL,
  actor VARCHAR(128) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
