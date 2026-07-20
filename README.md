# RFR AI Lab

RFR AI Lab is a Node.js + Express + PostgreSQL application for AI demand, AI asset, learning material and system administration workflows.

## Local Development

1. Install dependencies:

   ```bash
   npm ci
   ```

2. Create `.env` from `.env.example` and fill in local PostgreSQL settings.

3. Initialize local database with demo data:

   ```bash
   npm run db:init
   ```

4. Start the app:

   ```bash
   npm start
   ```

The app runs on `http://localhost:3100` by default.

## Zeabur Deployment

This repository includes `zbpack.json`, so Zeabur can install dependencies, migrate the database schema and start the backend from GitHub.

### Services

Create two services in the same Zeabur project:

1. PostgreSQL service
2. GitHub service for this repository

### App Environment Variables

Set these variables on the GitHub app service:

```text
NODE_ENV=production
DATABASE_URL=${POSTGRES_URI}
SESSION_USER_ID=1
ADMIN_EMAIL=<your admin email>
ADMIN_PASSWORD=<your initial admin password>
```

If your PostgreSQL service exposes `${POSTGRES_CONNECTION_STRING}` instead, set:

```text
DATABASE_URL=${POSTGRES_CONNECTION_STRING}
```

### Start Command

Zeabur reads `zbpack.json` and runs:

```bash
npm run start:zeabur
```

That command runs the schema migration first, then starts the Express backend:

```bash
npm run db:migrate && node src/server.js
```

The migration is safe to run repeatedly. It creates tables, indexes, required base parameters and a bootstrap admin only when the database has no users.

### Seed Demo Data

For local demos, use:

```bash
npm run db:init
```

Do not use `db:init` repeatedly against a production database unless you intentionally want to refresh demo seed records.
