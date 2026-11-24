-- Stores the verified customer birth date used by CPF + birth-date authentication.
-- The date is kept separately from the customer profile to avoid exposing it in
-- ordinary customer queries and to preserve the existing customers table shape.
CREATE TABLE IF NOT EXISTS customerBirthDates (
  customerId INT NOT NULL PRIMARY KEY,
  birthDate CHAR(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  CONSTRAINT fk_customerBirthDates_customer
    FOREIGN KEY (customerId) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
