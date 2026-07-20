import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URI || process.env.POSTGRES_CONNECTION_STRING;
const useSsl = process.env.PGSSLMODE === 'require' || /sslmode=require/i.test(connectionString || '');

export const pool = new Pool(connectionString
  ? {
      connectionString,
      ssl: useSsl ? { rejectUnauthorized: false } : undefined
    }
  : {
      host: process.env.PGHOST || 'localhost',
      port: Number(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE || 'rfr_ai_lab',
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD,
      ssl: useSsl ? { rejectUnauthorized: false } : undefined
    });

export async function query(text, params = []) {
  return pool.query(text, params);
}

export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
