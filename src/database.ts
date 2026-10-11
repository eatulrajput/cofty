import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import Database3 from 'better-sqlite3';

export interface ActivityLogEntry {
  workspaceName: string;
  fileExtension: string;
  languageId: string;
  gitBranch: string;
  activeSeconds: number;
  idleSeconds: number;
}

export interface DailySummary {
  date: string;
  activeSeconds: number;
  idleSeconds: number;
}

export interface LanguageSummary {
  languageId: string;
  totalSeconds: number;
}

export interface ProjectSummary {
  projectName: string;
  totalSeconds: number;
}

/**
 * FR-5: Local SQLite database layer using better-sqlite3.
 * Database file: context.globalStorageUri/cofty-data.db
 *
 * Fix #9  — Prepared statements are cached once at initialize() time instead
 *            of being re-created on every flush (previously called db.prepare()
 *            twice on every 60 s interval).
 * Fix #8  — purgeOlderThan() also removes orphaned projects rows that have no
 *            remaining activity_logs, preventing ghost entries in the dashboard.
 * Fix #3  — exportAsCsv() now wraps every field in RFC-4180 double-quotes and
 *            escapes embedded quotes, so project/branch names with commas are
 *            safe.
 */
export class Database {
  private db: Database3.Database | undefined;
  private readonly dbPath: string;

  // Fix #9: Cached prepared statements (created once in initialize())
  private stmtInsertProject!: Database3.Statement;
  private stmtSelectProject!: Database3.Statement;
  private stmtInsertLog!: Database3.Statement;

  constructor(globalStorageUri: vscode.Uri) {
    const storageDir = globalStorageUri.fsPath;
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }
    this.dbPath = path.join(storageDir, 'cofty-data.db');
  }

  async initialize(): Promise<void> {
    this.db = new Database3(this.dbPath);

    // Enable WAL mode for better performance
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');

    this.createSchema();

    // Fix #9: Prepare all write statements once here rather than on every call
    this.stmtInsertProject = this.db.prepare(
      `INSERT OR IGNORE INTO projects (name) VALUES (?)`,
    );
    this.stmtSelectProject = this.db.prepare(
      `SELECT id FROM projects WHERE name = ?`,
    );
    this.stmtInsertLog = this.db.prepare(`
      INSERT INTO activity_logs
        (project_id, file_extension, language_id, git_branch, active_seconds, idle_seconds)
      VALUES
        (?, ?, ?, ?, ?, ?)
    `);

    console.log(`[Cofty] Database ready at ${this.dbPath}`);
  }

  private createSchema(): void {
    if (!this.db) return;

    this.db.exec(`
      -- Projects & Workspaces
      CREATE TABLE IF NOT EXISTS projects (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Main Coding Telemetry Logs
      CREATE TABLE IF NOT EXISTS activity_logs (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id      INTEGER,
        file_extension  TEXT,
        language_id     TEXT,
        git_branch      TEXT,
        active_seconds  INTEGER NOT NULL DEFAULT 0,
        idle_seconds    INTEGER NOT NULL DEFAULT 0,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(project_id) REFERENCES projects(id)
      );

      -- Dashboard Query Acceleration Indexes
      CREATE INDEX IF NOT EXISTS idx_activity_created  ON activity_logs(created_at);
      CREATE INDEX IF NOT EXISTS idx_activity_project  ON activity_logs(project_id);
      CREATE INDEX IF NOT EXISTS idx_activity_language ON activity_logs(language_id);
    `);
  }

  /** FR-4: Insert a debounced activity log row */
  async insertActivityLog(entry: ActivityLogEntry): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Upsert project (uses cached statements — Fix #9)
    this.stmtInsertProject.run(entry.workspaceName);
    const project = this.stmtSelectProject.get(entry.workspaceName) as { id: number };

    this.stmtInsertLog.run(
      project.id,
      entry.fileExtension,
      entry.languageId,
      entry.gitBranch,
      entry.activeSeconds,
      entry.idleSeconds,
    );
  }

  /** Returns daily coding totals for the last N days (for heatmap) */
  getDailySummary(days: number = 90): DailySummary[] {
    if (!this.db) return [];

    return this.db
      .prepare(`
        SELECT
          DATE(created_at) AS date,
          SUM(active_seconds) AS activeSeconds,
          SUM(idle_seconds)   AS idleSeconds
        FROM activity_logs
        WHERE created_at >= DATE('now', '-' || ? || ' days')
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `)
      .all(days) as DailySummary[];
  }

  /** Returns per-language totals for the last N days */
  getLanguageSummary(days: number = 30): LanguageSummary[] {
    if (!this.db) return [];

    return this.db
      .prepare(`
        SELECT
          language_id   AS languageId,
          SUM(active_seconds) AS totalSeconds
        FROM activity_logs
        WHERE created_at >= DATE('now', '-' || ? || ' days')
          AND language_id IS NOT NULL AND language_id != ''
        GROUP BY language_id
        ORDER BY totalSeconds DESC
        LIMIT 15
      `)
      .all(days) as LanguageSummary[];
  }

  /** Returns per-project totals for the last N days */
  getProjectSummary(days: number = 30): ProjectSummary[] {
    if (!this.db) return [];

    return this.db
      .prepare(`
        SELECT
          p.name           AS projectName,
          SUM(a.active_seconds) AS totalSeconds
        FROM activity_logs a
        JOIN projects p ON p.id = a.project_id
        WHERE a.created_at >= DATE('now', '-' || ? || ' days')
        GROUP BY p.name
        ORDER BY totalSeconds DESC
      `)
      .all(days) as ProjectSummary[];
  }

  /** Returns today's active + idle seconds */
  getTodaySummary(): { activeSeconds: number; idleSeconds: number } {
    if (!this.db) return { activeSeconds: 0, idleSeconds: 0 };

    const row = this.db
      .prepare(`
        SELECT
          COALESCE(SUM(active_seconds), 0) AS activeSeconds,
          COALESCE(SUM(idle_seconds),   0) AS idleSeconds
        FROM activity_logs
        WHERE DATE(created_at) = DATE('now')
      `)
      .get() as { activeSeconds: number; idleSeconds: number };

    return row;
  }

  /** FR-6: Export all logs as JSON */
  exportAsJson(): string {
    if (!this.db) return '[]';

    const rows = this.db
      .prepare(`
        SELECT a.*, p.name AS project_name
        FROM activity_logs a
        LEFT JOIN projects p ON p.id = a.project_id
        ORDER BY a.created_at DESC
      `)
      .all();

    return JSON.stringify(rows, null, 2);
  }

  /**
   * FR-6: Export all logs as CSV.
   * Fix #3 — Every field is wrapped in RFC-4180 double-quotes and embedded
   * quotes are escaped as "". This handles project/branch names containing
   * commas, newlines, or quote characters without corrupting the file.
   */
  exportAsCsv(): string {
    if (!this.db) return '';

    const rows = this.db
      .prepare(`
        SELECT
          a.id, p.name AS project_name, a.file_extension,
          a.language_id, a.git_branch, a.active_seconds,
          a.idle_seconds, a.created_at
        FROM activity_logs a
        LEFT JOIN projects p ON p.id = a.project_id
        ORDER BY a.created_at DESC
      `)
      .all() as Record<string, unknown>[];

    if (rows.length === 0) return '';

    const quoteField = (v: unknown): string =>
      `"${String(v ?? '').replace(/"/g, '""')}"`;

    const headers = Object.keys(rows[0]).map(quoteField).join(',');
    const csvRows = rows.map((r) => Object.values(r).map(quoteField).join(','));
    return [headers, ...csvRows].join('\n');
  }

  /**
   * FR-7: Purge records older than N days.
   * Fix #8 — After deleting old activity_logs, also remove projects that no
   * longer have any logs (orphaned rows), which previously appeared as 0-second
   * ghost entries in the Project Breakdown chart.
   */
  purgeOlderThan(days: number): number {
    if (!this.db || days === 0) return 0;

    const result = this.db
      .prepare(`DELETE FROM activity_logs WHERE created_at < DATE('now', '-' || ? || ' days')`)
      .run(days);

    // Fix #8: Clean up orphaned project rows
    this.db
      .prepare(`DELETE FROM projects WHERE id NOT IN (SELECT DISTINCT project_id FROM activity_logs WHERE project_id IS NOT NULL)`)
      .run();

    console.log(`[Cofty] Purged ${result.changes} records older than ${days} days.`);
    return result.changes;
  }

  close(): void {
    this.db?.close();
  }

  getDbPath(): string {
    return this.dbPath;
  }
}
