import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function ensureTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nami_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

let initialized = false;

async function init(): Promise<void> {
  if (initialized) return;
  await ensureTable();
  initialized = true;
}

export async function dbGet<T>(key: string): Promise<T | null> {
  await init();
  const res = await pool.query("SELECT value FROM nami_settings WHERE key = $1", [key]);
  if (res.rows.length === 0) return null;
  return res.rows[0].value as T;
}

export async function dbSet<T>(key: string, value: T): Promise<void> {
  await init();
  await pool.query(
    `INSERT INTO nami_settings (key, value, updated_at) VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = NOW()`,
    [key, JSON.stringify(value)]
  );
}
