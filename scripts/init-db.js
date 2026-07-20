import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dbName = process.env.PGDATABASE || 'rfr_ai_lab';
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URI || process.env.POSTGRES_CONNECTION_STRING;
const useSsl = process.env.PGSSLMODE === 'require' || /sslmode=require/i.test(connectionString || '');

async function run() {
  if (!connectionString) {
    const adminClient = new Client({
      host: process.env.PGHOST || 'localhost',
      port: Number(process.env.PGPORT || 5432),
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD,
      database: 'postgres'
    });
    await adminClient.connect();
    const exists = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (exists.rowCount === 0) {
      await adminClient.query(`CREATE DATABASE ${quoteIdent(dbName)}`);
      console.log(`created database ${dbName}`);
    } else {
      console.log(`database ${dbName} already exists`);
    }
    await adminClient.end();
  } else {
    console.log('using DATABASE_URL/POSTGRES connection string');
  }

  const appClient = new Client(connectionString
    ? { connectionString, ssl: useSsl ? { rejectUnauthorized: false } : undefined }
    : {
        host: process.env.PGHOST || 'localhost',
        port: Number(process.env.PGPORT || 5432),
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD,
        database: dbName
      });
  await appClient.connect();
  await appClient.query(await fs.readFile(path.join(root, 'db', 'schema.sql'), 'utf8'));
  await appClient.query(await fs.readFile(path.join(root, 'db', 'seed.sql'), 'utf8'));
  await appClient.end();
  console.log('schema and seed data are ready');
}

function quoteIdent(value) {
  return '"' + String(value).replaceAll('"', '""') + '"';
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
