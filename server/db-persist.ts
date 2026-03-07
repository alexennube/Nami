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
    CREATE TABLE IF NOT EXISTS nami_kanban_columns (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nami_kanban_cards (
      id TEXT PRIMARY KEY,
      column_id TEXT NOT NULL,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nami_kanban_comments (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nami_crm_accounts (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nami_crm_contacts (
      id TEXT PRIMARY KEY,
      account_id TEXT,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nami_crm_contact_comments (
      id TEXT PRIMARY KEY,
      contact_id TEXT NOT NULL,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nami_crm_activities (
      id TEXT PRIMARY KEY,
      contact_id TEXT NOT NULL,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nami_crm_sequences (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_crm_contacts_account ON nami_crm_contacts(account_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_crm_activities_contact ON nami_crm_activities(contact_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_crm_comments_contact ON nami_crm_contact_comments(contact_id)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nami_audit_log (
      id TEXT PRIMARY KEY,
      record_type TEXT NOT NULL,
      action TEXT NOT NULL,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_log_record_type ON nami_audit_log(record_type)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_log_action ON nami_audit_log(action)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON nami_audit_log(created_at DESC)`);
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

export async function dbGetKanbanColumns(): Promise<any[]> {
  await init();
  const result = await pool.query("SELECT data FROM nami_kanban_columns ORDER BY (data->>'order')::int ASC");
  return result.rows.map(r => r.data);
}

export async function dbUpsertKanbanColumn(col: any): Promise<void> {
  await init();
  await pool.query(
    `INSERT INTO nami_kanban_columns (id, data, created_at) VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE SET data = $2::jsonb`,
    [col.id, JSON.stringify(col)]
  );
}

export async function dbDeleteKanbanColumn(id: string): Promise<void> {
  await init();
  const cardsResult = await pool.query("SELECT id FROM nami_kanban_cards WHERE column_id = $1", [id]);
  const cardIds = cardsResult.rows.map(r => r.id);
  if (cardIds.length > 0) {
    await pool.query("DELETE FROM nami_kanban_comments WHERE card_id = ANY($1::text[])", [cardIds]);
  }
  await pool.query("DELETE FROM nami_kanban_cards WHERE column_id = $1", [id]);
  await pool.query("DELETE FROM nami_kanban_columns WHERE id = $1", [id]);
}

export async function dbGetKanbanCards(): Promise<any[]> {
  await init();
  const result = await pool.query("SELECT data FROM nami_kanban_cards ORDER BY (data->>'order')::int ASC");
  return result.rows.map(r => r.data);
}

export async function dbUpsertKanbanCard(card: any): Promise<void> {
  await init();
  await pool.query(
    `INSERT INTO nami_kanban_cards (id, column_id, data, created_at, updated_at) VALUES ($1, $2, $3::jsonb, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET column_id = $2, data = $3::jsonb, updated_at = NOW()`,
    [card.id, card.columnId, JSON.stringify(card)]
  );
}

export async function dbDeleteKanbanCard(id: string): Promise<void> {
  await init();
  await pool.query("DELETE FROM nami_kanban_cards WHERE id = $1", [id]);
}

export async function dbGetKanbanComments(cardId: string): Promise<any[]> {
  await init();
  const result = await pool.query("SELECT data FROM nami_kanban_comments WHERE card_id = $1 ORDER BY created_at ASC", [cardId]);
  return result.rows.map(r => r.data);
}

export async function dbAddKanbanComment(comment: any): Promise<void> {
  await init();
  await pool.query(
    `INSERT INTO nami_kanban_comments (id, card_id, data, created_at) VALUES ($1, $2, $3::jsonb, NOW())`,
    [comment.id, comment.cardId, JSON.stringify(comment)]
  );
}

export async function dbDeleteKanbanComment(id: string): Promise<void> {
  await init();
  await pool.query("DELETE FROM nami_kanban_comments WHERE id = $1", [id]);
}

export async function dbDeleteKanbanCommentsByCard(cardId: string): Promise<void> {
  await init();
  await pool.query("DELETE FROM nami_kanban_comments WHERE card_id = $1", [cardId]);
}

export async function dbSaveKanbanBoard(columns: any[], cards: any[]): Promise<void> {
  await init();
  await pool.query("DELETE FROM nami_kanban_columns");
  await pool.query("DELETE FROM nami_kanban_cards");
  for (const col of columns) {
    await dbUpsertKanbanColumn(col);
  }
  for (const card of cards) {
    await dbUpsertKanbanCard(card);
  }
}

export async function dbGetCrmAccounts(): Promise<any[]> {
  await init();
  const result = await pool.query("SELECT data FROM nami_crm_accounts ORDER BY created_at DESC");
  return result.rows.map(r => r.data);
}

export async function dbGetCrmAccount(id: string): Promise<any | null> {
  await init();
  const result = await pool.query("SELECT data FROM nami_crm_accounts WHERE id = $1", [id]);
  return result.rows[0]?.data || null;
}

export async function dbUpsertCrmAccount(account: any): Promise<void> {
  await init();
  await pool.query(
    `INSERT INTO nami_crm_accounts (id, data, created_at, updated_at) VALUES ($1, $2::jsonb, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET data = $2::jsonb, updated_at = NOW()`,
    [account.id, JSON.stringify(account)]
  );
}

export async function dbDeleteCrmAccount(id: string): Promise<void> {
  await init();
  await pool.query("UPDATE nami_crm_contacts SET account_id = NULL, data = jsonb_set(data, '{accountId}', 'null') WHERE account_id = $1", [id]);
  await pool.query("DELETE FROM nami_crm_accounts WHERE id = $1", [id]);
}

export async function dbGetCrmContacts(): Promise<any[]> {
  await init();
  const result = await pool.query("SELECT data FROM nami_crm_contacts ORDER BY created_at DESC");
  return result.rows.map(r => r.data);
}

export async function dbGetCrmContactsByAccount(accountId: string): Promise<any[]> {
  await init();
  const result = await pool.query("SELECT data FROM nami_crm_contacts WHERE account_id = $1 ORDER BY created_at DESC", [accountId]);
  return result.rows.map(r => r.data);
}

export async function dbGetCrmContact(id: string): Promise<any | null> {
  await init();
  const result = await pool.query("SELECT data FROM nami_crm_contacts WHERE id = $1", [id]);
  return result.rows[0]?.data || null;
}

export async function dbUpsertCrmContact(contact: any): Promise<void> {
  await init();
  await pool.query(
    `INSERT INTO nami_crm_contacts (id, account_id, data, created_at, updated_at) VALUES ($1, $2, $3::jsonb, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET account_id = $2, data = $3::jsonb, updated_at = NOW()`,
    [contact.id, contact.accountId || null, JSON.stringify(contact)]
  );
}

export async function dbDeleteCrmContact(id: string): Promise<void> {
  await init();
  await pool.query("DELETE FROM nami_crm_contact_comments WHERE contact_id = $1", [id]);
  await pool.query("DELETE FROM nami_crm_activities WHERE contact_id = $1", [id]);
  await pool.query("DELETE FROM nami_crm_contacts WHERE id = $1", [id]);
}

export async function dbGetCrmContactComments(contactId: string): Promise<any[]> {
  await init();
  const result = await pool.query("SELECT data FROM nami_crm_contact_comments WHERE contact_id = $1 ORDER BY created_at ASC", [contactId]);
  return result.rows.map(r => r.data);
}

export async function dbAddCrmContactComment(comment: any): Promise<void> {
  await init();
  await pool.query(
    `INSERT INTO nami_crm_contact_comments (id, contact_id, data, created_at) VALUES ($1, $2, $3::jsonb, NOW())`,
    [comment.id, comment.contactId, JSON.stringify(comment)]
  );
}

export async function dbDeleteCrmContactComment(id: string): Promise<void> {
  await init();
  await pool.query("DELETE FROM nami_crm_contact_comments WHERE id = $1", [id]);
}

export async function dbGetCrmActivities(contactId: string): Promise<any[]> {
  await init();
  const result = await pool.query("SELECT data FROM nami_crm_activities WHERE contact_id = $1 ORDER BY created_at DESC", [contactId]);
  return result.rows.map(r => r.data);
}

export async function dbAddCrmActivity(activity: any): Promise<void> {
  await init();
  await pool.query(
    `INSERT INTO nami_crm_activities (id, contact_id, data, created_at) VALUES ($1, $2, $3::jsonb, NOW())`,
    [activity.id, activity.contactId, JSON.stringify(activity)]
  );
}

export async function dbGetCrmSequences(): Promise<any[]> {
  await init();
  const result = await pool.query("SELECT data FROM nami_crm_sequences ORDER BY created_at DESC");
  return result.rows.map(r => r.data);
}

export async function dbGetCrmSequence(id: string): Promise<any | null> {
  await init();
  const result = await pool.query("SELECT data FROM nami_crm_sequences WHERE id = $1", [id]);
  return result.rows[0]?.data || null;
}

export async function dbUpsertCrmSequence(sequence: any): Promise<void> {
  await init();
  await pool.query(
    `INSERT INTO nami_crm_sequences (id, data, created_at, updated_at) VALUES ($1, $2::jsonb, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET data = $2::jsonb, updated_at = NOW()`,
    [sequence.id, JSON.stringify(sequence)]
  );
}

export async function dbDeleteCrmSequence(id: string): Promise<void> {
  await init();
  await pool.query("DELETE FROM nami_crm_sequences WHERE id = $1", [id]);
}

export async function dbGetCrmSequencesByAccount(accountId: string): Promise<any[]> {
  await init();
  const result = await pool.query(
    "SELECT data FROM nami_crm_sequences WHERE data->>'accountId' = $1 ORDER BY created_at DESC",
    [accountId]
  );
  return result.rows.map((r: any) => r.data);
}

export async function dbInsertAuditLog(entry: any): Promise<void> {
  await init();
  await pool.query(
    `INSERT INTO nami_audit_log (id, record_type, action, data, created_at) VALUES ($1, $2, $3, $4::jsonb, NOW())`,
    [entry.id, entry.recordType, entry.action, JSON.stringify(entry)]
  );
}

export async function dbGetAuditLogs(opts?: {
  recordType?: string;
  action?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ entries: any[]; total: number }> {
  await init();
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIdx = 1;

  if (opts?.recordType) {
    conditions.push(`record_type = $${paramIdx++}`);
    params.push(opts.recordType);
  }
  if (opts?.action) {
    conditions.push(`action = $${paramIdx++}`);
    params.push(opts.action);
  }
  if (opts?.startDate) {
    conditions.push(`created_at >= $${paramIdx++}::timestamptz`);
    params.push(opts.startDate);
  }
  if (opts?.endDate) {
    conditions.push(`created_at <= $${paramIdx++}::timestamptz`);
    params.push(opts.endDate);
  }
  if (opts?.search) {
    conditions.push(`(data->>'recordName' ILIKE $${paramIdx} OR data->>'summary' ILIKE $${paramIdx})`);
    params.push(`%${opts.search}%`);
    paramIdx++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countRes = await pool.query(`SELECT COUNT(*) as count FROM nami_audit_log ${whereClause}`, params);
  const total = parseInt(countRes.rows[0].count, 10);

  const limit = opts?.limit || 50;
  const offset = opts?.offset || 0;
  const dataRes = await pool.query(
    `SELECT data FROM nami_audit_log ${whereClause} ORDER BY created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    [...params, limit, offset]
  );

  return { entries: dataRes.rows.map(r => r.data), total };
}

export async function dbGetAllAuditLogs(): Promise<any[]> {
  await init();
  const res = await pool.query("SELECT data FROM nami_audit_log ORDER BY created_at DESC");
  return res.rows.map(r => r.data);
}

export { pool, init as dbInit };
