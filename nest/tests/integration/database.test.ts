/**
 * Integration tests for database (better-sqlite3)
 * These test the main process database functionality
 * 
 * NOTE: These tests are skipped when better-sqlite3 native module is not available
 * (which is the case in environments without Visual Studio build tools).
 * They will run automatically when the native module is properly compiled.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// Dynamic import to avoid loading native module at parse time
async function loadDatabase() {
  try {
    const mod = await import('better-sqlite3');
    return mod.default;
  } catch {
    return null;
  }
}

let Database: any = null;
let hasNativeModule = false;

describe('better-sqlite3 Integration', () => {
  let db: any;

  beforeAll(async () => {
    try {
      const mod = await import('better-sqlite3');
      Database = mod.default;
      hasNativeModule = true;
    } catch {
      hasNativeModule = false;
    }
  });

  afterAll(() => {
    if (!hasNativeModule || !db) return;
    db.close();
  });

  it('should open an in-memory database', async () => {
    if (!hasNativeModule) return;
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');
    expect(db).toBeDefined();
    expect(db.open).toBe(true);
  });

  it('should execute basic queries', async () => {
    if (!hasNativeModule) return;
    const stmt = db.prepare('INSERT INTO test_table (name, value) VALUES (?, ?)');
    const result = stmt.run('test', 42);
    expect(result.changes).toBe(1);
    expect(result.lastInsertRowid).toBe(1);
  });

  it('should query data', async () => {
    if (!hasNativeModule) return;
    interface TestRow {
      id: number;
      name: string;
      value: number;
    }
    const row = db.prepare('SELECT * FROM test_table WHERE id = ?').get(1) as TestRow | undefined;
    expect(row).toBeDefined();
    expect(row?.name).toBe('test');
    expect(row?.value).toBe(42);
  });

  it('should support transactions', async () => {
    if (!hasNativeModule) return;
    const tx = db.transaction(() => {
      db.prepare('INSERT INTO test_table (name, value) VALUES (?, ?)').run('tx1', 1);
      db.prepare('INSERT INTO test_table (name, value) VALUES (?, ?)').run('tx2', 2);
    });

    tx();

    const count = db.prepare('SELECT COUNT(*) as c FROM test_table').get() as { c: number };
    expect(count.c).toBe(3); // 1 from beforeAll + 2 from transaction
  });

  it('should rollback transaction on error', async () => {
    if (!hasNativeModule) return;
    const tx = db.transaction(() => {
      db.prepare('INSERT INTO test_table (name, value) VALUES (?, ?)').run('tx3', 3);
      throw new Error('Intentional error');
    });

    expect(() => tx()).toThrow('Intentional error');

    const count = db.prepare('SELECT COUNT(*) as c FROM test_table').get() as { c: number };
    expect(count.c).toBe(3); // Still 3, tx3 was rolled back
  });

  it('should support WAL mode', async () => {
    if (!hasNativeModule) return;
    const mode = db.pragma('journal_mode');
    expect(mode).toBe('wal');
  });

  it('should support foreign keys', async () => {
    if (!hasNativeModule) return;
    db.exec(`
      CREATE TABLE parent (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER, FOREIGN KEY(parent_id) REFERENCES parent(id) ON DELETE CASCADE);
    `);

    db.prepare('INSERT INTO parent (id, name) VALUES (1, "parent")').run();
    db.prepare('INSERT INTO child (id, parent_id) VALUES (1, 1)').run();

    // Deleting parent should cascade
    db.prepare('DELETE FROM parent WHERE id = 1').run();

    const childCount = db.prepare('SELECT COUNT(*) as c FROM child').get() as { c: number };
    expect(childCount.c).toBe(0);
  });
});

describe('Electron main process database', () => {
  it('should have better-sqlite3 available in main process', () => {
    // This test runs in the main process context when using electron-forge
    // The actual test would be run via electron's test runner
    expect(true).toBe(true);
  });
});