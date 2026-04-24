import * as SQLite from 'expo-sqlite';
import { decryptText, encryptText } from './encryption';

export type GoalPeriod = 'daily' | 'weekly' | 'annually';

export type GoalRecord = {
  id: number;
  label: string;
  target: number;
  period: GoalPeriod;
};

let db: SQLite.SQLiteDatabase | null = null;

export async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync('safecalc.db');
    await initSchema(db);
  }
  return db;
}

async function initSchema(db: SQLite.SQLiteDatabase) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount REAL NOT NULL,
      note TEXT,
      category TEXT DEFAULT 'general',
      stash_location TEXT,
      is_decoy INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      target REAL NOT NULL,
      is_decoy INTEGER DEFAULT 0,
      period TEXT DEFAULT 'annually'
    );
    CREATE TABLE IF NOT EXISTS journal (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      mood TEXT,
      is_decoy INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS calc_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expression TEXT NOT NULL,
      result TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
   );
  `);

  const goalColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(goals)');
  const hasPeriod = goalColumns.some(col => col.name === 'period');
  if (!hasPeriod) {
    await db.execAsync("ALTER TABLE goals ADD COLUMN period TEXT DEFAULT 'annually';");
  }
  await db.execAsync("UPDATE goals SET period = 'annually' WHERE period IS NULL OR period = '';");
  await db.execAsync('CREATE UNIQUE INDEX IF NOT EXISTS idx_goals_decoy_period ON goals (is_decoy, period);');

  const decoyCount = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM entries WHERE is_decoy = 1'
  );
  if (decoyCount && decoyCount.count === 0) {
    await db.execAsync(`
      INSERT INTO entries (amount, note, category, is_decoy) VALUES
        (250.00, 'Vegetables and groceries', 'food', 1),
        (80.00, 'Auto fare to market', 'transport', 1),
        (500.00, 'Monthly mobile recharge', 'utilities', 1),
        (150.00, 'Medicine from pharmacy', 'health', 1),
        (320.00, 'School supplies', 'education', 1);
      INSERT INTO goals (label, target, is_decoy, period) VALUES
        ('Daily Budget', 250, 1, 'daily'),
        ('Weekly Budget', 1500, 1, 'weekly'),
        ('Annual Budget', 60000, 1, 'annually');
    `);
  }
}

export async function addEntry(
  amount: number, note: string, category: string,
  stashLocation: string, isDecoy: boolean
) {
  const database = await getDB();
  await database.runAsync(
    'INSERT INTO entries (amount, note, category, stash_location, is_decoy) VALUES (?, ?, ?, ?, ?)',
    [amount, note, category, stashLocation, isDecoy ? 1 : 0]
  );
}

export async function getEntries(isDecoy: boolean) {
  const database = await getDB();
  return database.getAllAsync<{
    id: number; amount: number; note: string;
    category: string; stash_location: string; created_at: string;
  }>('SELECT * FROM entries WHERE is_decoy = ? ORDER BY created_at DESC', [isDecoy ? 1 : 0]);
}

export async function getGoal(isDecoy: boolean) {
  const database = await getDB();
  return database.getFirstAsync<{ id: number; label: string; target: number }>(
    "SELECT id, label, target FROM goals WHERE is_decoy = ? AND period = 'annually' LIMIT 1",
    [isDecoy ? 1 : 0]
  );
}

export async function upsertGoal(label: string, target: number, isDecoy: boolean) {
  return upsertGoalByPeriod(label, target, isDecoy, 'annually');
}

export async function getGoals(isDecoy: boolean): Promise<Record<GoalPeriod, GoalRecord | null>> {
  const database = await getDB();
  const rows = await database.getAllAsync<GoalRecord>(
    'SELECT id, label, target, period FROM goals WHERE is_decoy = ?',
    [isDecoy ? 1 : 0]
  );

  const result: Record<GoalPeriod, GoalRecord | null> = {
    daily: null,
    weekly: null,
    annually: null,
  };

  rows.forEach(row => {
    if (row.period === 'daily' || row.period === 'weekly' || row.period === 'annually') {
      result[row.period] = row;
    }
  });

  return result;
}

export async function upsertGoalByPeriod(
  label: string,
  target: number,
  isDecoy: boolean,
  period: GoalPeriod
) {
  const database = await getDB();
  const existing = await database.getFirstAsync<{ id: number }>(
    'SELECT id FROM goals WHERE is_decoy = ? AND period = ? LIMIT 1',
    [isDecoy ? 1 : 0, period]
  );

  if (existing) {
    await database.runAsync('UPDATE goals SET label = ?, target = ? WHERE id = ?', [label, target, existing.id]);
  } else {
    await database.runAsync(
      'INSERT INTO goals (label, target, is_decoy, period) VALUES (?, ?, ?, ?)',
      [label, target, isDecoy ? 1 : 0, period]
    );
  }
}

export async function deleteEntry(id: number) {
  const database = await getDB();
  await database.runAsync('DELETE FROM entries WHERE id = ?', [id]);
}

export async function addCalcHistory(expression: string, result: string) {
  const database = await getDB();
  await database.runAsync(
    'INSERT INTO calc_history (expression, result) VALUES (?, ?)',
    [expression, result]
  );
  // Keep only last 50 entries so it looks natural
  await database.runAsync(
    'DELETE FROM calc_history WHERE id NOT IN (SELECT id FROM calc_history ORDER BY id DESC LIMIT 50)'
  );
}

export async function getCalcHistory() {
  const database = await getDB();
  return database.getAllAsync<{
    id: number;
    expression: string;
    result: string;
    created_at: string;
  }>('SELECT * FROM calc_history ORDER BY created_at DESC LIMIT 50');
}

export async function clearCalcHistory() {
  const database = await getDB();
  await database.runAsync('DELETE FROM calc_history');
}

export type JournalEntry = {
  id: number;
  content: string;
  mood: string | null;
  created_at: string;
};

export async function saveJournalEntry(content: string, mood: string, isDecoy: boolean) {
  const database = await getDB();
  const encryptedContent = await encryptText(content);
  await database.runAsync(
    'INSERT INTO journal (content, mood, is_decoy) VALUES (?, ?, ?)',
    [encryptedContent, mood, isDecoy ? 1 : 0]
  );
}

export async function getJournalEntries(isDecoy: boolean): Promise<JournalEntry[]> {
  const database = await getDB();
  const rows = await database.getAllAsync<{
    id: number;
    content: string;
    mood: string | null;
    created_at: string;
  }>('SELECT * FROM journal WHERE is_decoy = ? ORDER BY created_at DESC', [isDecoy ? 1 : 0]);

  const decryptedRows = await Promise.all(
    rows.map(async row => {
      try {
        return {
          ...row,
          content: await decryptText(row.content),
        };
      } catch {
        return {
          ...row,
          content: '[Unable to decrypt entry]',
        };
      }
    })
  );

  return decryptedRows;
}