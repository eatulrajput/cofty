import * as vscode from 'vscode';
import { StateMachine, CodingState } from './stateMachine';
import { Database } from './database';

export interface ActivityContext {
  workspaceName: string;
  fileExtension: string;
  languageId: string;
  gitBranch: string;
}

/**
 * FR-3 & FR-4: In-memory accumulator.
 * Tallies active/idle seconds and flushes to SQLite every 60 seconds
 * (or immediately on deactivation).
 *
 * Fix #2 — Break reminder now uses modulo so it repeats every N minutes
 *           of continuous coding instead of firing only once per session.
 */
export class Accumulator {
  private activeSeconds: number = 0;
  private idleSeconds: number = 0;
  private flushTimer: NodeJS.Timeout | undefined;
  private tickTimer: NodeJS.Timeout | undefined;
  private context: ActivityContext = {
    workspaceName: 'unknown',
    fileExtension: '',
    languageId: 'unknown',
    gitBranch: 'unknown',
  };

  // Cumulative today totals (used by status bar); seeded from DB on start()
  private sessionActiveSeconds: number = 0;
  private sessionIdleSeconds: number = 0;
  private continuousActiveSeconds: number = 0;

  constructor(
    private readonly database: Database,
    private readonly stateMachine: StateMachine,
  ) {}

  start(): void {
    // Seed session counter with today's already-persisted total so the
    // status bar shows cumulative today time, not just current-session time.
    const todaySnapshot = this.database.getTodaySummary();
    this.sessionActiveSeconds = todaySnapshot.activeSeconds;
    this.sessionIdleSeconds = todaySnapshot.idleSeconds;

    // Tick every second to increment counters
    this.tickTimer = setInterval(() => this.tick(), 1_000);

    // Flush to DB every 60 seconds (FR-4)
    this.flushTimer = setInterval(() => this.flushNow(), 60_000);

    console.log('[Cofty] Accumulator started.');
  }

  updateContext(ctx: Partial<ActivityContext>): void {
    this.context = { ...this.context, ...ctx };
  }

  /** Called by ActivityListener on each user event */
  recordActivity(): void {
    // State machine already tracks lastActivityTime via transitionTo().
    // This hook is kept for any future per-event logic.
  }

  getSessionActiveSeconds(): number {
    return this.sessionActiveSeconds;
  }

  getSessionIdleSeconds(): number {
    return this.sessionIdleSeconds;
  }

  getContinuousActiveSeconds(): number {
    return this.continuousActiveSeconds;
  }

  private tick(): void {
    const state = this.stateMachine.getState();

    if (state === CodingState.Active) {
      this.activeSeconds += 1;
      this.sessionActiveSeconds += 1;
      this.continuousActiveSeconds += 1;

      // FR-10: Break reminder — check at every full minute boundary.
      // Fix #2: Use modulo so the reminder repeats every breakMins of
      // continuous coding instead of only firing once per session.
      if (this.continuousActiveSeconds % 60 === 0) {
        const config = vscode.workspace.getConfiguration('cofty');
        const breakMins = config.get<number>('breakReminderMinutes', 90);
        const thresholdSeconds = breakMins * 60;

        if (
          breakMins > 0 &&
          thresholdSeconds > 0 &&
          this.continuousActiveSeconds % thresholdSeconds === 0
        ) {
          const elapsed = Math.round(this.continuousActiveSeconds / 60);
          vscode.window.showInformationMessage(
            `☕ Cofty — ${elapsed} minutes of deep work! Consider a short break.`,
            'Dismiss',
          );
        }
      }
    } else {
      this.idleSeconds += 1;
      this.sessionIdleSeconds += 1;
      this.continuousActiveSeconds = 0;
    }
  }

  /** Flush accumulated buffer to SQLite */
  async flushNow(): Promise<void> {
    if (this.activeSeconds === 0 && this.idleSeconds === 0) {
      return;
    }

    const toFlush = {
      workspaceName: this.context.workspaceName,
      fileExtension: this.context.fileExtension,
      languageId: this.context.languageId,
      gitBranch: this.context.gitBranch,
      activeSeconds: this.activeSeconds,
      idleSeconds: this.idleSeconds,
    };

    // Reset buffer before async call to avoid double-counting on error
    this.activeSeconds = 0;
    this.idleSeconds = 0;

    try {
      await this.database.insertActivityLog(toFlush);
    } catch (err) {
      console.error('[Cofty] Failed to flush activity log:', err);
    }
  }

  dispose(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
    }
  }
}
