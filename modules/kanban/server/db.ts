export function createKanbanDb(pool: { query: (text: string, params?: any[]) => Promise<any> }) {
  let initialized = false;

  async function ensureTables(): Promise<void> {
    if (initialized) return;
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
    initialized = true;
  }

  async function init() {
    await ensureTables();
  }

  async function getColumns(): Promise<any[]> {
    await init();
    const result = await pool.query("SELECT data FROM nami_kanban_columns ORDER BY (data->>'order')::int ASC");
    return result.rows.map((r: any) => r.data);
  }

  async function upsertColumn(col: any): Promise<void> {
    await init();
    await pool.query(
      `INSERT INTO nami_kanban_columns (id, data, created_at) VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET data = $2::jsonb`,
      [col.id, JSON.stringify(col)]
    );
  }

  async function deleteColumn(id: string): Promise<void> {
    await init();
    const cardsResult = await pool.query("SELECT id FROM nami_kanban_cards WHERE column_id = $1", [id]);
    const cardIds = cardsResult.rows.map((r: any) => r.id);
    if (cardIds.length > 0) {
      await pool.query("DELETE FROM nami_kanban_comments WHERE card_id = ANY($1::text[])", [cardIds]);
    }
    await pool.query("DELETE FROM nami_kanban_cards WHERE column_id = $1", [id]);
    await pool.query("DELETE FROM nami_kanban_columns WHERE id = $1", [id]);
  }

  async function getCards(): Promise<any[]> {
    await init();
    const result = await pool.query("SELECT data FROM nami_kanban_cards ORDER BY (data->>'order')::int ASC");
    return result.rows.map((r: any) => r.data);
  }

  async function upsertCard(card: any): Promise<void> {
    await init();
    await pool.query(
      `INSERT INTO nami_kanban_cards (id, column_id, data, created_at, updated_at) VALUES ($1, $2, $3::jsonb, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET column_id = $2, data = $3::jsonb, updated_at = NOW()`,
      [card.id, card.columnId, JSON.stringify(card)]
    );
  }

  async function deleteCard(id: string): Promise<void> {
    await init();
    await pool.query("DELETE FROM nami_kanban_cards WHERE id = $1", [id]);
  }

  async function getComments(cardId: string): Promise<any[]> {
    await init();
    const result = await pool.query("SELECT data FROM nami_kanban_comments WHERE card_id = $1 ORDER BY created_at ASC", [cardId]);
    return result.rows.map((r: any) => r.data);
  }

  async function addComment(comment: any): Promise<void> {
    await init();
    await pool.query(
      `INSERT INTO nami_kanban_comments (id, card_id, data, created_at) VALUES ($1, $2, $3::jsonb, NOW())`,
      [comment.id, comment.cardId, JSON.stringify(comment)]
    );
  }

  async function deleteComment(id: string): Promise<void> {
    await init();
    await pool.query("DELETE FROM nami_kanban_comments WHERE id = $1", [id]);
  }

  async function deleteCommentsByCard(cardId: string): Promise<void> {
    await init();
    await pool.query("DELETE FROM nami_kanban_comments WHERE card_id = $1", [cardId]);
  }

  async function saveBoard(columns: any[], cards: any[]): Promise<void> {
    await init();
    await pool.query("DELETE FROM nami_kanban_columns");
    await pool.query("DELETE FROM nami_kanban_cards");
    for (const col of columns) {
      await upsertColumn(col);
    }
    for (const card of cards) {
      await upsertCard(card);
    }
  }

  return {
    ensureTables,
    getColumns,
    upsertColumn,
    deleteColumn,
    getCards,
    upsertCard,
    deleteCard,
    getComments,
    addComment,
    deleteComment,
    deleteCommentsByCard,
    saveBoard,
  };
}

export type KanbanDb = ReturnType<typeof createKanbanDb>;
