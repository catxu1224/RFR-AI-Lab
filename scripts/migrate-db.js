import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URI || process.env.POSTGRES_CONNECTION_STRING;
const useSsl = process.env.PGSSLMODE === 'require' || /sslmode=require/i.test(connectionString || '');

async function run() {
  const client = new Client(connectionString
    ? { connectionString, ssl: useSsl ? { rejectUnauthorized: false } : undefined }
    : {
        host: process.env.PGHOST || 'localhost',
        port: Number(process.env.PGPORT || 5432),
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE || 'rfr_ai_lab'
      });

  await client.connect();
  await client.query(await fs.readFile(path.join(root, 'db', 'schema.sql'), 'utf8'));
  await ensureBaseData(client);
  await client.end();
  console.log('database schema is ready');
}

async function ensureBaseData(client) {
  await client.query(`
    INSERT INTO project_categories (name, sort_order) VALUES
      ('General', 1),
      ('Risk', 2),
      ('Compliance', 3),
      ('Data', 4)
    ON CONFLICT (name) DO NOTHING
  `);
  await client.query(`
    INSERT INTO asset_categories (name, sort_order) VALUES
      ('Agent', 1),
      ('Skills', 2),
      ('Other', 3)
    ON CONFLICT (name) DO NOTHING
  `);
  await client.query(`
    INSERT INTO request_tags (name, description, sort_order) VALUES
      ('AI Consulting Project', 'Client-facing AI consulting project request.', 1),
      ('AI Delivery Accelerator', 'Internal AI tool or automation for delivery acceleration.', 2),
      ('AI Asset', 'Reusable AI asset, agent or service.', 3)
    ON CONFLICT (name) DO NOTHING
  `);

  const users = await client.query('SELECT COUNT(*)::INT AS count FROM users');
  if (users.rows[0].count > 0) return;

  const email = process.env.ADMIN_EMAIL || 'admin@rfr-ai-lab.local';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const username = usernameFromEmail(email) || 'admin';
  const hash = await bcrypt.hash(password, 10);
  await client.query(
    `INSERT INTO users (username, chinese_name, english_name, email, password_hash, level, role, status, last_login_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'admin', 'active', NOW())`,
    [username, process.env.ADMIN_CHINESE_NAME || 'System Admin', process.env.ADMIN_ENGLISH_NAME || 'System, Admin', email, hash, process.env.ADMIN_LEVEL || 'M']
  );
  console.log(`created bootstrap admin user ${email}`);
}

function usernameFromEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  const atIndex = value.indexOf('@');
  return atIndex > 0 ? value.slice(0, atIndex) : '';
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
