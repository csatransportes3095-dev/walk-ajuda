# Database Migration - Email Accounts Table

## Overview
This migration creates the `emailAccounts` table to store metadata about Zoho Mail accounts, including their type (principal or membro).

## What Changed

### New Table: `emailAccounts`
- **id**: Auto-incrementing primary key
- **emailAddress**: Email address (unique constraint)
- **type**: Enum field - 'principal' or 'membro' (default: 'membro')
- **createdAt**: Timestamp (bigint, Unix milliseconds)
- **updatedAt**: Timestamp (bigint, Unix milliseconds)

### Migration File
- Located: `drizzle/0124_create_email_accounts.sql`
- Automatically run via `pnpm run db:push`

## How to Apply

### Prerequisites
1. Ensure your `.env` file has `DATABASE_URL` set:
   ```
   DATABASE_URL=mysql://user:password@host:port/database_name
   ```

### Run Migration
```bash
# Using pnpm (recommended)
pnpm run db:push

# Or using npm
npm run db:push
```

### Manual Application (if automation fails)
```bash
# Set DATABASE_URL environment variable
export DATABASE_URL="mysql://user:password@host:port/database"

# Run Drizzle migration manually
drizzle-kit generate
drizzle-kit migrate
```

## After Migration

The AdminEmail component will automatically:
1. Show email accounts grouped by type (Principal / Membros)
2. Allow selecting account type when creating new accounts
3. Store type information in the database
4. Remove type info when accounts are deleted

## Troubleshooting

**Error: "DATABASE_URL is required"**
- Make sure `.env` file exists in project root
- DATABASE_URL should be a valid MySQL connection string
- Format: `mysql://user:pass@localhost:3306/dbname`

**Error: "Connection refused"**
- Verify database server is running
- Check hostname, port, credentials in DATABASE_URL
- Ensure user has permission to create tables

**Error: "Table already exists"**
- The table may have been created by a previous migration
- Drizzle should handle this gracefully
- Check database directly: `SHOW TABLES LIKE 'emailAccounts'`

## Rollback (if needed)

There is no automatic rollback. To remove the table:
```sql
DROP TABLE IF EXISTS emailAccounts;
```

Then re-run migration if needed.
