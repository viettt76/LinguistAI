import * as SQLite from 'expo-sqlite';
import { Collection, Flashcard, ApiKey } from '../types';

/**
 * SQLite database manager for LinguistAI.
 * Centralizes all raw SQL operations.
 */

const DB_NAME = 'linguistai.db';

let dbInstance: SQLite.SQLiteDatabase | null = null;

export async function getDb() {
  if (dbInstance) return dbInstance;
  dbInstance = await SQLite.openDatabaseAsync(DB_NAME);
  return dbInstance;
}

export async function resetDailyRepsIfNeeded() {
  try {
    const db = await getDb();
    const lastReset = await getSetting('last_reps_reset');
    // Use local date for "today" to match user's perspective
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    if (lastReset !== today) {
      console.log(`[DB] New day detected (${today}). Resetting daily reps...`);
      await db.runAsync('UPDATE flashcards SET daily_reps = 0');
      await setSetting('last_reps_reset', today);
      return true;
    }
    return false;
  } catch (error) {
    console.error("[DB] Error resetting daily reps:", error);
    return false;
  }
}

export async function initDb() {
  const db = await getDb();

  try {
    // 1. Create tables
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      
      CREATE TABLE IF NOT EXISTS collections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        icon TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS flashcards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        collection_id INTEGER NOT NULL,
        english TEXT NOT NULL,
        phonetic TEXT,
        vietnamese TEXT NOT NULL,
        word_type TEXT NOT NULL,
        grammar_note TEXT,
        example_en TEXT,
        example_vi TEXT,
        daily_reps INTEGER DEFAULT 0,
        last_studied_at TEXT,
        total_reps INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS api_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        api_key TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        fail_count INTEGER DEFAULT 0,
        last_failed_at TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);

    // Migration: Add icon column to collections if it doesn't exist
    try { await db.execAsync("ALTER TABLE collections ADD COLUMN icon TEXT;"); } catch (e) {}

    // Migration: Add AI-related columns to flashcards if they don't exist
    try { await db.execAsync("ALTER TABLE flashcards ADD COLUMN word_type TEXT DEFAULT '';"); } catch (e) {}
    try { await db.execAsync("ALTER TABLE flashcards ADD COLUMN grammar_note TEXT;"); } catch (e) {}
    try { await db.execAsync("ALTER TABLE flashcards ADD COLUMN example_en TEXT;"); } catch (e) {}
    try { await db.execAsync("ALTER TABLE flashcards ADD COLUMN example_vi TEXT;"); } catch (e) {}

    // 2. Robust Seed: Ensure Inbox exists and is tracked
    let inboxId: number | null = null;
    
    // Check settings first
    const inboxSetting = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM app_settings WHERE key = 'inbox_collection_id'"
    );
    
    if (inboxSetting) {
      inboxId = Number(inboxSetting.value);
    }
    
    // Verify the collection actually exists
    const existingInbox = await db.getFirstAsync<{ id: number }>(
      "SELECT id FROM collections WHERE name = 'Inbox' LIMIT 1"
    );
    
    if (existingInbox) {
      inboxId = existingInbox.id;
    } else {
      // Create it if missing
      const createdAt = new Date().toISOString();
      const result = await db.runAsync(
        "INSERT INTO collections (name, icon, created_at) VALUES ('Inbox', '📥', ?)",
        [createdAt]
      );
      inboxId = result.lastInsertRowId;
    }
    
    // Ensure setting is synced
    if (inboxId) {
      await db.runAsync(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('inbox_collection_id', ?)",
        [String(inboxId)]
      );
    }

    console.log("[DB] Database initialized successfully.");
  } catch (error) {
    console.error("[DB] Fatal Initialization Error:", error);
    dbInstance = null;
    throw error;
  }
}


// --- Collection Operations ---

export async function getAllCollections(): Promise<Collection[]> {
  const db = await getDb();
  return await db.getAllAsync<Collection>('SELECT * FROM collections ORDER BY created_at DESC');
}

export async function createCollection(name: string, icon: string): Promise<number> {
  const db = await getDb();
  // Check for duplicate name (case-insensitive)
  const existing = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM collections WHERE LOWER(name) = LOWER(?)',
    [name.trim()]
  );
  if (existing) {
    throw new Error(`Collection "${name}" already exists.`);
  }
  const createdAt = new Date().toISOString();
  const result = await db.runAsync(
    'INSERT INTO collections (name, icon, created_at) VALUES (?, ?, ?)',
    [name.trim(), icon ?? null, createdAt]
  );
  return result.lastInsertRowId;
}

export async function updateCollection(id: number, name: string, icon: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE collections SET name = ?, icon = ? WHERE id = ?', [name, icon ?? null, id]);
}

export async function deleteCollection(id: number): Promise<void> {
  const db = await getDb();
  // Get inbox id first
  const setting = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_settings WHERE key = 'inbox_collection_id'"
  );
  const inboxId = setting ? Number(setting.value) : null;
  if (inboxId) {
    await db.runAsync(
      'UPDATE flashcards SET collection_id = ? WHERE collection_id = ?',
      [inboxId, id]
    );
  }
  await db.runAsync('DELETE FROM collections WHERE id = ?', [id]);
}

export async function deleteMultipleCollections(ids: number[]): Promise<void> {
  if (!ids.length) return;
  const db = await getDb();
  const setting = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_settings WHERE key = 'inbox_collection_id'"
  );
  const inboxId = setting ? Number(setting.value) : null;
  const placeholders = ids.map(() => '?').join(',');
  if (inboxId) {
    await db.runAsync(
      `UPDATE flashcards SET collection_id = ? WHERE collection_id IN (${placeholders})`,
      [inboxId, ...ids]
    );
  }
  await db.runAsync(`DELETE FROM collections WHERE id IN (${placeholders})`, ids);
}

// --- Flashcard Operations ---

export async function getFlashcardsByCollection(collectionId: number): Promise<Flashcard[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    'SELECT *, collection_id as collection_id FROM flashcards WHERE collection_id = ? ORDER BY created_at DESC',
    [collectionId]
  );
  return rows as Flashcard[];
}

export async function getAllFlashcards(): Promise<Flashcard[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>('SELECT *, collection_id as collection_id FROM flashcards ORDER BY created_at DESC');
  return rows as Flashcard[];
}

export async function searchFlashcards(query: string): Promise<(Flashcard & { collection_name: string; collection_icon: string })[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    `SELECT f.*, f.collection_id as collection_id, d.name as collection_name, d.icon as collection_icon FROM flashcards f
     LEFT JOIN collections d ON f.collection_id = d.id
     WHERE f.english LIKE ?
     LIMIT 50`,
    [`%${query}%`]
  );
  return rows as (Flashcard & { collection_name: string; collection_icon: string })[];
}

export async function createFlashcard(card: Omit<Flashcard, 'id' | 'daily_reps' | 'last_studied_at' | 'total_reps'>): Promise<number> {
  const db = await getDb();
  const createdAt = card.created_at || new Date().toISOString();
  const result = await db.runAsync(
    `INSERT INTO flashcards (
      collection_id, english, vietnamese, phonetic, word_type, 
      grammar_note, example_en, example_vi, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      card.collection_id, 
      card.english, 
      card.vietnamese, 
      card.phonetic ?? null, 
      card.word_type ?? null,
      card.grammar_note ?? null, 
      card.example_en ?? null, 
      card.example_vi ?? null, 
      createdAt
    ]
  );
  return result.lastInsertRowId;
}

export async function createFlashcardBulk(
  cards: Array<Omit<Flashcard, 'id' | 'daily_reps' | 'last_studied_at' | 'total_reps'>>
): Promise<void> {
  const db = await getDb();

  // Get inbox id as fallback
  const setting = await db.getFirstAsync<{ value: string }>("SELECT value FROM app_settings WHERE key = 'inbox_collection_id'");
  const inboxId = setting ? Number(setting.value) : 1;

  // Get valid collection ids
  const validCollections = await db.getAllAsync<{ id: number }>("SELECT id FROM collections");
  const validCollectionIds = new Set(validCollections.map(d => d.id));

  await db.runAsync('BEGIN TRANSACTION');
  try {
    const baseTime = Date.now();
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const targetCollectionId = (card.collection_id && validCollectionIds.has(Number(card.collection_id))) ? Number(card.collection_id) : inboxId;

      // Always insert new card to avoid missing cards in bulk operations
      const createdAt = card.created_at || new Date(baseTime + i).toISOString();
      await db.runAsync(
        `INSERT INTO flashcards (
          collection_id, english, vietnamese, phonetic, word_type,
          grammar_note, example_en, example_vi, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          targetCollectionId, card.english ?? '', card.vietnamese ?? '', card.phonetic ?? null,
          card.word_type ?? null, card.grammar_note ?? null, card.example_en ?? null,
          card.example_vi ?? null, createdAt
        ]
      );
    }
    await db.runAsync('COMMIT');
  } catch (e) {
    await db.runAsync('ROLLBACK');
    throw e;
  }
}

export async function updateFlashcardRep(id: number, dailyReps: number, totalReps: number): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    'UPDATE flashcards SET daily_reps = ?, total_reps = ?, last_studied_at = ? WHERE id = ?',
    [dailyReps, totalReps, now, id]
  );
}

export async function deleteFlashcard(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM flashcards WHERE id = ?', [id]);
}

export async function deleteMultipleFlashcards(ids: number[]): Promise<void> {
  if (!ids.length) return;
  const db = await getDb();
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(`DELETE FROM flashcards WHERE id IN (${placeholders})`, ids);
}

export async function updateFlashcard(card: Partial<Flashcard> & { id: number }): Promise<void> {
  const db = await getDb();
  const { id, ...rest } = card;
  const fields = Object.keys(rest) as (keyof typeof rest)[];
  if (fields.length === 0) return;
  const query = `UPDATE flashcards SET ${fields.map(f => `${f} = ?`).join(', ')} WHERE id = ?`;
  const values = [...fields.map(f => (rest as any)[f] ?? null), id];
  await db.runAsync(query, values);
}

export async function moveFlashcard(id: number, targetCollectionId: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE flashcards SET collection_id = ? WHERE id = ?', [targetCollectionId, id]);
}

export async function moveMultipleFlashcards(ids: number[], targetCollectionId: number): Promise<void> {
  if (!ids.length) return;
  const db = await getDb();
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(
    `UPDATE flashcards SET collection_id = ? WHERE id IN (${placeholders})`,
    [targetCollectionId, ...ids]
  );
}

export async function findDuplicateFlashcard(english: string, wordType?: string): Promise<Flashcard | null> {
  const db = await getDb();
  let query = `SELECT *, collection_id as collection_id FROM flashcards WHERE LOWER(TRIM(english)) = LOWER(TRIM(?))`;
  const params: any[] = [english];
  
  if (wordType) {
    query += ` AND LOWER(TRIM(word_type)) = LOWER(TRIM(?))`;
    params.push(wordType);
  }
  
  query += ` LIMIT 1`;
  const row = await db.getFirstAsync<any>(query, params);
  return row as Flashcard | null;
}

export async function findDuplicateFlashcardInCollection(english: string, collectionId: number, wordType?: string): Promise<Flashcard | null> {
  const db = await getDb();
  let query = `SELECT *, collection_id as collection_id FROM flashcards 
               WHERE collection_id = ? 
               AND LOWER(TRIM(english)) = LOWER(TRIM(?))`;
  const params: any[] = [collectionId, english];
  
  if (wordType) {
    query += ` AND LOWER(TRIM(word_type)) = LOWER(TRIM(?))`;
    params.push(wordType);
  }
  
  query += ` LIMIT 1`;
  const row = await db.getFirstAsync<any>(query, params);
  return row as Flashcard | null;
}

// --- API Key Operations ---

export async function getApiKeys(): Promise<ApiKey[]> {
  const db = await getDb();
  return await db.getAllAsync<ApiKey>('SELECT * FROM api_keys ORDER BY fail_count ASC, created_at DESC');
}

export async function addApiKey(key: string): Promise<void> {
  const db = await getDb();
  const createdAt = new Date().toISOString();
  await db.runAsync(
    'INSERT INTO api_keys (api_key, created_at) VALUES (?, ?)',
    [key, createdAt]
  );
}

export async function updateApiKeyStatus(id: number, isActive: boolean): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE api_keys SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, id]);
}

export async function recordApiKeyFailure(id: number): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    'UPDATE api_keys SET fail_count = fail_count + 1, last_failed_at = ? WHERE id = ?',
    [now, id]
  );
}

export async function deleteApiKey(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM api_keys WHERE id = ?', [id]);
}

// --- Settings ---

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const result = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = ?',
    [key]
  );
  return result?.value || null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)',
    [key, value]
  );
}

// --- Export / Import ---

export async function exportAllData(): Promise<{ version: string; exportedAt: string; collections: Collection[]; cards: Flashcard[] }> {
  const db = await getDb();
  const collections = await db.getAllAsync<Collection>('SELECT * FROM collections');
  const rawCards = await db.getAllAsync<any>('SELECT *, collection_id as collection_id FROM flashcards');
  return {
    version: '2.0',
    exportedAt: new Date().toISOString(),
    collections,
    cards: rawCards as Flashcard[],
  };
}

export async function importBackupData(collections: any[], cards: any[]): Promise<void> {
  const db = await getDb();

  // 1. Map old collections to new IDs by name
  for (const collection of collections) {
    if (!collection.name) continue;
    const existing = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM collections WHERE LOWER(name) = LOWER(?)',
      [collection.name]
    );
    if (!existing) {
      const createdAt = collection.created_at || new Date().toISOString();
      await db.runAsync(
        'INSERT OR IGNORE INTO collections (name, icon, created_at) VALUES (?, ?, ?)',
        [collection.name, collection.icon || '📚', createdAt]
      );
    }
  }

  // 2. Fetch fresh mapping of name -> id
  const currentCollections = await db.getAllAsync<{ id: number, name: string }>('SELECT id, name FROM collections');
  const nameToIdMap: Record<string, number> = {};
  const validCollectionIds = new Set<number>();
  currentCollections.forEach(d => {
    nameToIdMap[d.name.toLowerCase()] = d.id;
    validCollectionIds.add(d.id);
  });

  // Get inbox id as fallback
  const inboxSetting = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_settings WHERE key = 'inbox_collection_id'"
  );
  const inboxId = inboxSetting ? Number(inboxSetting.value) : 1;

  // 3. Import cards
  const baseTime = Date.now();
  await db.runAsync('BEGIN TRANSACTION');
  try {
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      if (!card.english || !card.vietnamese) continue;

      const createdAt = card.created_at || new Date(baseTime + i).toISOString();

      let targetId = inboxId;

      // Attempt mapping
      const oldCollection = collections.find(d => d.id === card.collection_id);
      if (oldCollection && oldCollection.name && nameToIdMap[oldCollection.name.toLowerCase()] !== undefined) {
        targetId = nameToIdMap[oldCollection.name.toLowerCase()];
      } else if (card.collection_name && nameToIdMap[card.collection_name.toLowerCase()] !== undefined) {
        targetId = nameToIdMap[card.collection_name.toLowerCase()];
      } else if (card.collection_id && validCollectionIds.has(Number(card.collection_id))) {
        targetId = Number(card.collection_id);
      }

      await db.runAsync(
        `INSERT OR IGNORE INTO flashcards (
          collection_id, english, vietnamese, phonetic, word_type,
          grammar_note, example_en, example_vi, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          targetId,
          card.english ?? '',
          card.vietnamese ?? '',
          card.phonetic ?? null,
          card.word_type ?? null,
          card.grammar_note ?? null,
          card.example_en ?? null,
          card.example_vi ?? null,
          createdAt ?? new Date().toISOString(),
        ]
      );
    }
    await db.runAsync('COMMIT');
  } catch (e) {
    await db.runAsync('ROLLBACK');
    throw e;
  }
}
