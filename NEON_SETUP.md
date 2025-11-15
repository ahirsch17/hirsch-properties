# Neon PostgreSQL Setup Guide

Your app has been migrated from MySQL to Neon PostgreSQL. Follow these steps to set up your database.

## Step 1: Get Your Database Connection String

1. Go to your [Neon Console](https://console.neon.tech)
2. Select your project
3. Go to the "Connection Details" section
4. Copy your connection string (it should look like: `postgresql://user:password@host/database?sslmode=require`)

## Step 2: Set Environment Variable

Create a `.env` file in the root directory (if it doesn't exist):

```bash
DATABASE_URL=your_neon_connection_string_here
PORT=3000
```

**Important:** The `.env` file is git-ignored, so your credentials won't be committed.

## Step 3: Create the Bookings Table

You have two options:

### Option A: Using Neon Console (Recommended)
1. Go to your Neon Console
2. Click on "SQL Editor"
3. Copy and paste the contents of `init-db.sql`
4. Run the query

### Option B: Using psql command line
```bash
psql "your_neon_connection_string" -f init-db.sql
```

### Option C: Using Neon CLI
```bash
npx neonctl db execute --sql-file init-db.sql
```

## Step 4: Test Your Connection

Start your server:
```bash
npm start
```

Try accessing the booking page and see if times load correctly. Check the server console for any database errors.

## Troubleshooting

### Error: "relation 'Bookings' does not exist"
- Make sure you've run the `init-db.sql` script to create the table

### Error: "Connection refused" or "Connection timeout"
- Check that your `DATABASE_URL` is correct
- Verify that your Neon database is running (check the Neon console)
- Make sure your IP isn't blocked (Neon allows all IPs by default)

### Error: "password authentication failed"
- Verify your connection string is correct
- Check that you copied the entire connection string including the password

## What Changed from MySQL

- **Database driver**: Changed from `mysql2` to `pg` (PostgreSQL)
- **Connection method**: Now uses connection pool instead of individual connections
- **SQL syntax**: Changed from `?` placeholders to `$1, $2, $3...` (PostgreSQL style)
- **Column names**: Using quoted identifiers for camelCase columns (`"cancelId"`, `"firstName"`, `"lastName"`)
- **Result format**: Changed from `[rows]` to `result.rows` and `affectedRows` to `rowCount`

## Notes

- Neon provides a free tier with generous limits
- The connection pool automatically manages connections
- SSL is required for Neon connections (already configured in the code)

