import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function ensureTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nami_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nami_agents (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nami_swarms (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nami_chat_sessions (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nami_chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL DEFAULT 'default',
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON nami_chat_messages(session_id)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nami_swarm_messages (
      id TEXT PRIMARY KEY,
      swarm_id TEXT NOT NULL,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_swarm_messages_swarm ON nami_swarm_messages(swarm_id)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nami_thoughts (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nami_memories (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nami_usage (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nami_docs (
      slug TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nami_browser_logs (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      selector TEXT,
      content TEXT,
      agent_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nami_workspace_files (
      path TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      size INTEGER DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nami_google_accounts (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      refresh_token TEXT NOT NULL,
      is_default BOOLEAN DEFAULT false,
      display_name TEXT,
      avatar_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

let initialized = false;

async function init(): Promise<void> {
  if (initialized) return;
  await ensureTables();
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

export async function dbUpsertRow(table: string, id: string, data: any, extraCols?: Record<string, any>): Promise<void> {
  await init();
  const cols = extraCols || {};
  const extraKeys = Object.keys(cols);
  if (extraKeys.length > 0) {
    const placeholders = extraKeys.map((_, i) => `$${i + 3}`).join(", ");
    const colNames = extraKeys.join(", ");
    const updateParts = [`data = $2::jsonb`, `updated_at = NOW()`, ...extraKeys.map((k, i) => `${k} = $${i + 3}`)];
    await pool.query(
      `INSERT INTO ${table} (id, data, ${colNames}, updated_at) VALUES ($1, $2::jsonb, ${placeholders}, NOW())
       ON CONFLICT (id) DO UPDATE SET ${updateParts.join(", ")}`,
      [id, JSON.stringify(data), ...extraKeys.map(k => cols[k])]
    );
  } else {
    await pool.query(
      `INSERT INTO ${table} (id, data, updated_at) VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET data = $2::jsonb, updated_at = NOW()`,
      [id, JSON.stringify(data)]
    );
  }
}

export async function dbInsertRow(table: string, id: string, data: any, extraCols?: Record<string, any>): Promise<void> {
  await init();
  const cols = extraCols || {};
  const extraKeys = Object.keys(cols);
  if (extraKeys.length > 0) {
    const placeholders = extraKeys.map((_, i) => `$${i + 3}`).join(", ");
    const colNames = extraKeys.join(", ");
    await pool.query(
      `INSERT INTO ${table} (id, data, ${colNames}) VALUES ($1, $2::jsonb, ${placeholders})
       ON CONFLICT (id) DO NOTHING`,
      [id, JSON.stringify(data), ...extraKeys.map(k => cols[k])]
    );
  } else {
    await pool.query(
      `INSERT INTO ${table} (id, data) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO NOTHING`,
      [id, JSON.stringify(data)]
    );
  }
}

export async function dbDeleteRow(table: string, id: string): Promise<void> {
  await init();
  await pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
}

export async function dbDeleteWhere(table: string, column: string, value: string): Promise<void> {
  await init();
  await pool.query(`DELETE FROM ${table} WHERE ${column} = $1`, [value]);
}

export async function dbGetAllRows<T>(table: string): Promise<T[]> {
  await init();
  const res = await pool.query(`SELECT data FROM ${table} ORDER BY created_at ASC`);
  return res.rows.map(r => r.data as T);
}

export async function dbGetRowsByColumn<T>(table: string, column: string, value: string): Promise<T[]> {
  await init();
  const res = await pool.query(`SELECT data FROM ${table} WHERE ${column} = $1 ORDER BY created_at ASC`, [value]);
  return res.rows.map(r => r.data as T);
}

export async function dbUpsertByKey(table: string, keyCol: string, keyVal: string, data: any): Promise<void> {
  await init();
  await pool.query(
    `INSERT INTO ${table} (${keyCol}, data, updated_at) VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (${keyCol}) DO UPDATE SET data = $2::jsonb, updated_at = NOW()`,
    [keyVal, JSON.stringify(data)]
  );
}

export async function dbDeleteByKey(table: string, keyCol: string, keyVal: string): Promise<void> {
  await init();
  await pool.query(`DELETE FROM ${table} WHERE ${keyCol} = $1`, [keyVal]);
}

export async function dbTruncate(table: string): Promise<void> {
  await init();
  await pool.query(`DELETE FROM ${table}`);
}

export async function dbGetRowCount(table: string): Promise<number> {
  await init();
  const res = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
  return parseInt(res.rows[0].count, 10);
}

export interface GoogleAccount {
  id: string;
  email: string;
  refresh_token: string;
  is_default: boolean;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export async function getGoogleAccounts(): Promise<GoogleAccount[]> {
  await init();
  const res = await pool.query("SELECT * FROM nami_google_accounts ORDER BY created_at ASC");
  return res.rows;
}

export async function getDefaultGoogleAccount(): Promise<GoogleAccount | null> {
  await init();
  const res = await pool.query("SELECT * FROM nami_google_accounts WHERE is_default = true LIMIT 1");
  return res.rows[0] || null;
}

export async function upsertGoogleAccount(account: {
  id: string;
  email: string;
  refresh_token: string;
  is_default?: boolean;
  display_name?: string | null;
  avatar_url?: string | null;
}): Promise<void> {
  await init();
  await pool.query(
    `INSERT INTO nami_google_accounts (id, email, refresh_token, is_default, display_name, avatar_url, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (email) DO UPDATE SET
       refresh_token = EXCLUDED.refresh_token,
       is_default = EXCLUDED.is_default,
       display_name = EXCLUDED.display_name,
       avatar_url = EXCLUDED.avatar_url,
       updated_at = NOW()`,
    [
      account.id,
      account.email,
      account.refresh_token,
      account.is_default ?? false,
      account.display_name ?? null,
      account.avatar_url ?? null,
    ]
  );
}

export async function deleteGoogleAccount(id: string): Promise<void> {
  await init();
  await pool.query("DELETE FROM nami_google_accounts WHERE id = $1", [id]);
}

export async function setDefaultGoogleAccount(id: string): Promise<boolean> {
  await init();
  const check = await pool.query("SELECT id FROM nami_google_accounts WHERE id = $1", [id]);
  if (check.rows.length === 0) return false;
  await pool.query("UPDATE nami_google_accounts SET is_default = false, updated_at = NOW()");
  await pool.query("UPDATE nami_google_accounts SET is_default = true, updated_at = NOW() WHERE id = $1", [id]);
  return true;
}

export async function dbSaveWorkspaceFile(filePath: string, content: string): Promise<void> {
  await init();
  await pool.query(
    `INSERT INTO nami_workspace_files (path, content, size, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (path) DO UPDATE SET content = $2, size = $3, updated_at = NOW()`,
    [filePath, content, content.length]
  );
}

export async function dbDeleteWorkspaceFile(filePath: string): Promise<void> {
  await init();
  await pool.query("DELETE FROM nami_workspace_files WHERE path = $1", [filePath]);
}

export async function dbDeleteWorkspaceFilesUnderDir(dirPath: string): Promise<void> {
  await init();
  const prefix = dirPath.endsWith("/") ? dirPath : dirPath + "/";
  await pool.query("DELETE FROM nami_workspace_files WHERE path = $1 OR path LIKE $2", [dirPath, prefix + "%"]);
}

export async function dbGetAllWorkspaceFiles(): Promise<{ path: string; content: string }[]> {
  await init();
  const result = await pool.query("SELECT path, content FROM nami_workspace_files ORDER BY updated_at DESC");
  return result.rows;
}

export { pool, init as dbInit };
