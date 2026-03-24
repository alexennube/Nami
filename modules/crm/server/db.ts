export function createCrmDb(pool: { query: (text: string, params?: any[]) => Promise<any> }) {
  let initialized = false;

  async function ensureTables(): Promise<void> {
    if (initialized) return;
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
    initialized = true;
  }

  async function init() {
    await ensureTables();
  }

  async function getAccounts(): Promise<any[]> {
    await init();
    const result = await pool.query("SELECT data FROM nami_crm_accounts ORDER BY created_at DESC");
    return result.rows.map((r: any) => r.data);
  }

  async function getAccount(id: string): Promise<any | null> {
    await init();
    const result = await pool.query("SELECT data FROM nami_crm_accounts WHERE id = $1", [id]);
    return result.rows[0]?.data || null;
  }

  async function upsertAccount(account: any): Promise<void> {
    await init();
    await pool.query(
      `INSERT INTO nami_crm_accounts (id, data, created_at, updated_at) VALUES ($1, $2::jsonb, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET data = $2::jsonb, updated_at = NOW()`,
      [account.id, JSON.stringify(account)]
    );
  }

  async function deleteAccount(id: string): Promise<void> {
    await init();
    await pool.query("UPDATE nami_crm_contacts SET account_id = NULL, data = jsonb_set(data, '{accountId}', 'null') WHERE account_id = $1", [id]);
    await pool.query("DELETE FROM nami_crm_accounts WHERE id = $1", [id]);
  }

  async function getContacts(): Promise<any[]> {
    await init();
    const result = await pool.query("SELECT data FROM nami_crm_contacts ORDER BY created_at DESC");
    return result.rows.map((r: any) => r.data);
  }

  async function getContactsByAccount(accountId: string): Promise<any[]> {
    await init();
    const result = await pool.query("SELECT data FROM nami_crm_contacts WHERE account_id = $1 ORDER BY created_at DESC", [accountId]);
    return result.rows.map((r: any) => r.data);
  }

  async function getContact(id: string): Promise<any | null> {
    await init();
    const result = await pool.query("SELECT data FROM nami_crm_contacts WHERE id = $1", [id]);
    return result.rows[0]?.data || null;
  }

  async function upsertContact(contact: any): Promise<void> {
    await init();
    await pool.query(
      `INSERT INTO nami_crm_contacts (id, account_id, data, created_at, updated_at) VALUES ($1, $2, $3::jsonb, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET account_id = $2, data = $3::jsonb, updated_at = NOW()`,
      [contact.id, contact.accountId || null, JSON.stringify(contact)]
    );
  }

  async function deleteContact(id: string): Promise<void> {
    await init();
    await pool.query("DELETE FROM nami_crm_contact_comments WHERE contact_id = $1", [id]);
    await pool.query("DELETE FROM nami_crm_activities WHERE contact_id = $1", [id]);
    await pool.query("DELETE FROM nami_crm_contacts WHERE id = $1", [id]);
  }

  async function getContactComments(contactId: string): Promise<any[]> {
    await init();
    const result = await pool.query("SELECT data FROM nami_crm_contact_comments WHERE contact_id = $1 ORDER BY created_at ASC", [contactId]);
    return result.rows.map((r: any) => r.data);
  }

  async function addContactComment(comment: any): Promise<void> {
    await init();
    await pool.query(
      `INSERT INTO nami_crm_contact_comments (id, contact_id, data, created_at) VALUES ($1, $2, $3::jsonb, NOW())`,
      [comment.id, comment.contactId, JSON.stringify(comment)]
    );
  }

  async function deleteContactComment(id: string): Promise<void> {
    await init();
    await pool.query("DELETE FROM nami_crm_contact_comments WHERE id = $1", [id]);
  }

  async function getActivities(contactId: string): Promise<any[]> {
    await init();
    const result = await pool.query("SELECT data FROM nami_crm_activities WHERE contact_id = $1 ORDER BY created_at DESC", [contactId]);
    return result.rows.map((r: any) => r.data);
  }

  async function addActivity(activity: any): Promise<void> {
    await init();
    await pool.query(
      `INSERT INTO nami_crm_activities (id, contact_id, data, created_at) VALUES ($1, $2, $3::jsonb, NOW())`,
      [activity.id, activity.contactId, JSON.stringify(activity)]
    );
  }

  async function getSequences(): Promise<any[]> {
    await init();
    const result = await pool.query("SELECT data FROM nami_crm_sequences ORDER BY created_at DESC");
    return result.rows.map((r: any) => r.data);
  }

  async function getSequence(id: string): Promise<any | null> {
    await init();
    const result = await pool.query("SELECT data FROM nami_crm_sequences WHERE id = $1", [id]);
    return result.rows[0]?.data || null;
  }

  async function upsertSequence(sequence: any): Promise<void> {
    await init();
    await pool.query(
      `INSERT INTO nami_crm_sequences (id, data, created_at, updated_at) VALUES ($1, $2::jsonb, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET data = $2::jsonb, updated_at = NOW()`,
      [sequence.id, JSON.stringify(sequence)]
    );
  }

  async function deleteSequence(id: string): Promise<void> {
    await init();
    await pool.query("DELETE FROM nami_crm_sequences WHERE id = $1", [id]);
  }

  async function getSequencesByAccount(accountId: string): Promise<any[]> {
    await init();
    const result = await pool.query(
      "SELECT data FROM nami_crm_sequences WHERE data->>'accountId' = $1 ORDER BY created_at DESC",
      [accountId]
    );
    return result.rows.map((r: any) => r.data);
  }

  return {
    ensureTables,
    getAccounts,
    getAccount,
    upsertAccount,
    deleteAccount,
    getContacts,
    getContactsByAccount,
    getContact,
    upsertContact,
    deleteContact,
    getContactComments,
    addContactComment,
    deleteContactComment,
    getActivities,
    addActivity,
    getSequences,
    getSequence,
    upsertSequence,
    deleteSequence,
    getSequencesByAccount,
  };
}

export type CrmDb = ReturnType<typeof createCrmDb>;
