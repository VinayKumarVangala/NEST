/**
 * Database connection, migrations, repositories
 */
import Database from 'better-sqlite3';
import { app } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, existsSync } from 'node:fs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

let db: Database.Database | null = null;

const MIGRATIONS = [
  // 001_initial_schema
  `
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS applications (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    project_path TEXT NOT NULL,
    runtime_label TEXT,
    executable TEXT NOT NULL,
    args TEXT NOT NULL, -- JSON array
    working_directory TEXT NOT NULL,
    env TEXT NOT NULL, -- JSON array of {key, value, secret}
    protocol TEXT NOT NULL CHECK (protocol IN ('http', 'https')),
    port INTEGER NOT NULL CHECK (port BETWEEN 1 AND 65535),
    expected_listen_address TEXT NOT NULL CHECK (expected_listen_address IN ('loopback', 'all', 'specific')),
    lifecycle_mode TEXT NOT NULL CHECK (lifecycle_mode IN ('managed', 'external')),
    startup_timeout_ms INTEGER NOT NULL,
    health_check TEXT NOT NULL, -- JSON
    lan_launch_profile TEXT, -- JSON
    selected_interface TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS runtime_state (
    app_id TEXT PRIMARY KEY,
    process_state TEXT NOT NULL CHECK (process_state IN ('registered', 'starting', 'running', 'stopping', 'stopped', 'failed', 'external', 'unknown')),
    health_state TEXT NOT NULL CHECK (health_state IN ('healthy', 'unhealthy', 'checking', 'unknown', 'not_applicable')),
    pid INTEGER,
    process_start_time INTEGER,
    port_state TEXT NOT NULL CHECK (port_state IN ('free', 'occupied_by_managed', 'occupied_by_other', 'listening_loopback', 'listening_all', 'listening_lan', 'unknown')),
    listener_address TEXT,
    last_health_check TEXT, -- JSON
    last_error TEXT,
    started_at INTEGER,
    stopped_at INTEGER,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (app_id) REFERENCES applications(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS access_policies (
    app_id TEXT PRIMARY KEY,
    mode TEXT NOT NULL CHECK (mode IN ('local_only', 'lan_requested', 'lan_enabled', 'lan_unavailable', 'lan_disabled')),
    selected_interface TEXT,
    firewall_rule_ref TEXT,
    last_verification TEXT CHECK (last_verification IN ('unverified', 'local_ok', 'remote_user_confirmed', 'failed')),
    last_verification_at INTEGER,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (app_id) REFERENCES applications(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS activity_logs (
    id TEXT PRIMARY KEY,
    app_id TEXT,
    event_type TEXT NOT NULL CHECK (event_type IN ('start', 'stop', 'restart', 'crash', 'health_change', 'lan_enable', 'lan_disable', 'firewall_change', 'error', 'info')),
    severity TEXT NOT NULL CHECK (severity IN ('debug', 'info', 'warn', 'error')),
    message TEXT NOT NULL,
    details TEXT, -- JSON
    timestamp INTEGER NOT NULL,
    FOREIGN KEY (app_id) REFERENCES applications(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_activity_logs_app_id ON activity_logs(app_id);
  CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp ON activity_logs(timestamp);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL -- JSON
  );

  INSERT INTO schema_migrations (version, applied_at) VALUES (1, strftime('%s', 'now') * 1000);
  `,
];

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

export async function initializeDatabase(): Promise<void> {
  const userDataPath = app.getPath('userData');
  const dbPath = join(userDataPath, 'nest.db');

  // Ensure directory exists
  if (!existsSync(userDataPath)) {
    mkdirSync(userDataPath, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');

  // Run migrations
  const appliedMigrations = db.prepare('SELECT version FROM schema_migrations').all() as {
    version: number;
  }[];
  const appliedVersions = new Set(appliedMigrations.map((m) => m.version));

  for (let i = 0; i < MIGRATIONS.length; i++) {
    const version = i + 1;
    if (!appliedVersions.has(version)) {
      db.exec(MIGRATIONS[i]);
      console.log(`[DB] Applied migration ${version}`);
    }
  }

  // Insert default settings if not present
  const defaultSettings = {
    backgroundMode: true,
    shutdownPolicy: 'ask',
    startupAtLogin: false,
    defaultAccessPolicy: 'local_only',
    preferredInterface: null,
    confirmationPreferences: {},
    logRetentionDays: 30,
    logMaxLinesPerApp: 5000,
  };

  for (const [key, value] of Object.entries(defaultSettings)) {
    const existing = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    if (!existing) {
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, JSON.stringify(value));
    }
  }

  console.log('[DB] Database initialized at', dbPath);
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// Repository functions
export const ApplicationRepository = {
  create: (app: any) => {
    const stmt = db!.prepare(`
      INSERT INTO applications (id, name, project_path, runtime_label, executable, args, working_directory, env, protocol, port, expected_listen_address, lifecycle_mode, startup_timeout_ms, health_check, lan_launch_profile, selected_interface, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      app.id,
      app.name,
      app.projectPath,
      app.runtimeLabel ?? null,
      app.executable,
      JSON.stringify(app.args),
      app.workingDirectory,
      JSON.stringify(app.env),
      app.protocol,
      app.port,
      app.expectedListenAddress,
      app.lifecycleMode,
      app.startupTimeoutMs,
      JSON.stringify(app.healthCheck),
      app.lanLaunchProfile ? JSON.stringify(app.lanLaunchProfile) : null,
      app.selectedInterface ?? null,
      app.createdAt,
      app.updatedAt
    );
  },

  get: (id: string) => {
    const row = db!.prepare('SELECT * FROM applications WHERE id = ?').get(id);
    return row ? mapRowToApplication(row) : null;
  },

  list: () => {
    const rows = db!.prepare('SELECT * FROM applications ORDER BY created_at DESC').all();
    return rows.map(mapRowToApplication);
  },

  update: (id: string, updates: Partial<any>) => {
    const fields: string[] = [];
    const values: any[] = [];

    const fieldMap: Record<string, string> = {
      name: 'name',
      projectPath: 'project_path',
      runtimeLabel: 'runtime_label',
      executable: 'executable',
      args: 'args',
      workingDirectory: 'working_directory',
      env: 'env',
      protocol: 'protocol',
      port: 'port',
      expectedListenAddress: 'expected_listen_address',
      lifecycleMode: 'lifecycle_mode',
      startupTimeoutMs: 'startup_timeout_ms',
      healthCheck: 'health_check',
      lanLaunchProfile: 'lan_launch_profile',
      selectedInterface: 'selected_interface',
    };

    for (const [key, value] of Object.entries(updates)) {
      if (fieldMap[key]) {
        fields.push(`${fieldMap[key]} = ?`);
        if (['args', 'env', 'healthCheck', 'lanLaunchProfile'].includes(key)) {
          values.push(JSON.stringify(value));
        } else {
          values.push(value);
        }
      }
    }

    if (fields.length === 0) return;

    fields.push('updated_at = ?');
    values.push(Date.now());
    values.push(id);

    db!.prepare(`UPDATE applications SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  },

  delete: (id: string) => {
    db!.prepare('DELETE FROM applications WHERE id = ?').run(id);
  },
};

export const RuntimeStateRepository = {
  get: (appId: string) => {
    const row = db!.prepare('SELECT * FROM runtime_state WHERE app_id = ?').get(appId);
    return row ? mapRowToRuntimeState(row) : null;
  },

  upsert: (state: any) => {
    db!
      .prepare(
        `
      INSERT INTO runtime_state (app_id, process_state, health_state, pid, process_start_time, port_state, listener_address, last_health_check, last_error, started_at, stopped_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(app_id) DO UPDATE SET
        process_state = excluded.process_state,
        health_state = excluded.health_state,
        pid = excluded.pid,
        process_start_time = excluded.process_start_time,
        port_state = excluded.port_state,
        listener_address = excluded.listener_address,
        last_health_check = excluded.last_health_check,
        last_error = excluded.last_error,
        started_at = excluded.started_at,
        stopped_at = excluded.stopped_at,
        updated_at = excluded.updated_at
    `
      )
      .run(
        state.appId,
        state.processState,
        state.healthState,
        state.pid ?? null,
        state.processStartTime ?? null,
        state.portState,
        state.listenerAddress ?? null,
        state.lastHealthCheck ? JSON.stringify(state.lastHealthCheck) : null,
        state.lastError ?? null,
        state.startedAt ?? null,
        state.stoppedAt ?? null,
        state.updatedAt
      );
  },

  delete: (appId: string) => {
    db!.prepare('DELETE FROM runtime_state WHERE app_id = ?').run(appId);
  },
};

export const AccessPolicyRepository = {
  get: (appId: string) => {
    const row = db!.prepare('SELECT * FROM access_policies WHERE app_id = ?').get(appId);
    return row ? mapRowToAccessPolicy(row) : null;
  },

  upsert: (policy: any) => {
    db!
      .prepare(
        `
      INSERT INTO access_policies (app_id, mode, selected_interface, firewall_rule_ref, last_verification, last_verification_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(app_id) DO UPDATE SET
        mode = excluded.mode,
        selected_interface = excluded.selected_interface,
        firewall_rule_ref = excluded.firewall_rule_ref,
        last_verification = excluded.last_verification,
        last_verification_at = excluded.last_verification_at,
        updated_at = excluded.updated_at
    `
      )
      .run(
        policy.appId,
        policy.mode,
        policy.selectedInterface ?? null,
        policy.firewallRuleRef ?? null,
        policy.lastVerification ?? null,
        policy.lastVerificationAt ?? null,
        policy.updatedAt
      );
  },

  list: () => {
    const rows = db!.prepare('SELECT * FROM access_policies').all();
    return rows.map(mapRowToAccessPolicy);
  },
};

export const ActivityLogRepository = {
  insert: (entry: any) => {
    db!
      .prepare(
        `
      INSERT INTO activity_logs (id, app_id, event_type, severity, message, details, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        entry.id,
        entry.appId ?? null,
        entry.eventType,
        entry.severity,
        entry.message,
        JSON.stringify(entry.details ?? {}),
        entry.timestamp
      );
  },

  query: (params: {
    appId?: string;
    eventType?: string[];
    severity?: string[];
    from?: number;
    to?: number;
    text?: string;
    limit: number;
    offset: number;
  }) => {
    let sql = 'SELECT * FROM activity_logs WHERE 1=1';
    const values: any[] = [];

    if (params.appId) {
      sql += ' AND app_id = ?';
      values.push(params.appId);
    }
    if (params.eventType?.length) {
      sql += ` AND event_type IN (${params.eventType.map(() => '?').join(',')})`;
      values.push(...params.eventType);
    }
    if (params.severity?.length) {
      sql += ` AND severity IN (${params.severity.map(() => '?').join(',')})`;
      values.push(...params.severity);
    }
    if (params.from) {
      sql += ' AND timestamp >= ?';
      values.push(params.from);
    }
    if (params.to) {
      sql += ' AND timestamp <= ?';
      values.push(params.to);
    }
    if (params.text) {
      sql += ' AND (message LIKE ? OR details LIKE ?)';
      values.push(`%${params.text}%`, `%${params.text}%`);
    }

    sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    values.push(params.limit, params.offset);

    const rows = db!.prepare(sql).all(...values);
    const total = db!
      .prepare(sql.replace('SELECT *', 'SELECT COUNT(*) as count').replace(/ORDER BY.*/, ''))
      .get(...values.slice(0, -2)) as { count: number };

    return {
      entries: rows.map(mapRowToActivityLog),
      total: total.count,
    };
  },

  prune: (olderThan: number) => {
    db!.prepare('DELETE FROM activity_logs WHERE timestamp < ?').run(olderThan);
  },
};

export const SettingsRepository = {
  get: () => {
    const rows = db!.prepare('SELECT key, value FROM settings').all() as {
      key: string;
      value: string;
    }[];
    const settings: Record<string, any> = {};
    for (const row of rows) {
      try {
        settings[row.key] = JSON.parse(row.value);
      } catch {
        settings[row.key] = row.value;
      }
    }
    return settings;
  },

  set: (key: string, value: any) => {
    db!
      .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
      .run(key, JSON.stringify(value));
  },
};

// Mappers
function mapRowToApplication(row: any): any {
  return {
    id: row.id,
    name: row.name,
    projectPath: row.project_path,
    runtimeLabel: row.runtime_label,
    executable: row.executable,
    args: JSON.parse(row.args),
    workingDirectory: row.working_directory,
    env: JSON.parse(row.env),
    protocol: row.protocol,
    port: row.port,
    expectedListenAddress: row.expected_listen_address,
    lifecycleMode: row.lifecycle_mode,
    startupTimeoutMs: row.startup_timeout_ms,
    healthCheck: JSON.parse(row.health_check),
    lanLaunchProfile: row.lan_launch_profile ? JSON.parse(row.lan_launch_profile) : undefined,
    selectedInterface: row.selected_interface,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRowToRuntimeState(row: any): any {
  return {
    appId: row.app_id,
    processState: row.process_state,
    healthState: row.health_state,
    pid: row.pid,
    processStartTime: row.process_start_time,
    portState: row.port_state,
    listenerAddress: row.listener_address,
    lastHealthCheck: row.last_health_check ? JSON.parse(row.last_health_check) : undefined,
    lastError: row.last_error,
    startedAt: row.started_at,
    stoppedAt: row.stopped_at,
    updatedAt: row.updated_at,
  };
}

function mapRowToAccessPolicy(row: any): any {
  return {
    appId: row.app_id,
    mode: row.mode,
    selectedInterface: row.selected_interface,
    firewallRuleRef: row.firewall_rule_ref,
    lastVerification: row.last_verification,
    lastVerificationAt: row.last_verification_at,
    updatedAt: row.updated_at,
  };
}

function mapRowToActivityLog(row: any): any {
  return {
    id: row.id,
    appId: row.app_id,
    eventType: row.event_type,
    severity: row.severity,
    message: row.message,
    details: row.details ? JSON.parse(row.details) : undefined,
    timestamp: row.timestamp,
  };
}

export function loadSettings(): any {
  return SettingsRepository.get();
}

export function saveSettings(settings: Partial<any>): void {
  for (const [key, value] of Object.entries(settings)) {
    SettingsRepository.set(key, value);
  }
}
