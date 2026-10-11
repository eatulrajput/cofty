import * as vscode from 'vscode';
import { StateMachine, CodingState } from './stateMachine';
import { Accumulator } from './accumulator';

/**
 * FR-8: Status Bar Controller.
 * Shows a custom icon (pink when active, muted when idle) + live timer.
 *
 * Fix #14 — statusBarItem.color is partially deprecated in newer VS Code
 *            themes and may be ignored or overridden.  We now use
 *            statusBarItem.backgroundColor (a ThemeColor) for the background
 *            tint and keep the hex only for the text/icon foreground via
 *            statusBarItem.color which still works for foreground in all themes.
 *            When active, a subtle pink background tint is applied; when idle
 *            or paused the background is cleared so it blends with the bar.
 */
export class StatusBarController {
  private readonly statusBarItem: vscode.StatusBarItem;
  private updateTimer: NodeJS.Timeout | undefined;
  private stateDisposable: vscode.Disposable | undefined;

  // Brand hex colors (PRD §1.1)
  private readonly COLOR_ACTIVE = new vscode.ThemeColor('statusBarItem.warningForeground');
  private readonly COLOR_IDLE   = new vscode.ThemeColor('statusBar.foreground');

  // Background tints — use built-in ThemeColor keys so VS Code handles
  // the actual rendering correctly across all themes.
  private readonly BG_ACTIVE = new vscode.ThemeColor('statusBarItem.warningBackground');

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly stateMachine: StateMachine,
    private readonly accumulator: Accumulator,
  ) {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100,
    );
    this.statusBarItem.command = 'cofty.openDashboard';
    this.statusBarItem.tooltip = 'Cofty — Click to open dashboard';
    context.subscriptions.push(this.statusBarItem);
  }

  start(): void {
    this.statusBarItem.show();
    this.render();

    // Update every second for live counter
    this.updateTimer = setInterval(() => this.render(), 1_000);

    // Re-render immediately on state change
    this.stateDisposable = this.stateMachine.onStateChange(() => this.render());

    console.log('[Cofty] StatusBar started.');
  }

  private render(): void {
    const state = this.stateMachine.getState();
    const isActive = state === CodingState.Active;
    const totalActive = this.accumulator.getSessionActiveSeconds();

    const icon = isActive ? '$(symbol-event)' : '$(watch)';
    const label = this.formatDuration(totalActive);
    const stateLabel = isActive ? 'active' : 'idle';

    this.statusBarItem.text  = `${icon} ${label}`;

    // Fix #14: Use ThemeColor for both color and backgroundColor so VS Code
    // theme tokens control rendering instead of raw hex strings, which can be
    // ignored or cause contrast issues in light/high-contrast themes.
    this.statusBarItem.color           = isActive ? this.COLOR_ACTIVE : this.COLOR_IDLE;
    this.statusBarItem.backgroundColor = isActive ? this.BG_ACTIVE : undefined;

    this.statusBarItem.tooltip = new vscode.MarkdownString(
      `**Cofty** — ${stateLabel}\n\n` +
        `⏱ Active today: **${label}**\n\n` +
        `Click to open dashboard`,
    );
  }

  private formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    if (h > 0) {
      return `${h}h ${m.toString().padStart(2, '0')}m`;
    }
    return `${m}m ${s.toString().padStart(2, '0')}s`;
  }

  setTrackingState(enabled: boolean): void {
    if (!enabled) {
      this.statusBarItem.text            = `$(circle-slash) Cofty paused`;
      this.statusBarItem.color           = this.COLOR_IDLE;
      this.statusBarItem.backgroundColor = undefined;
      this.statusBarItem.tooltip         = 'Cofty tracking is paused. Click to open dashboard.';
    } else {
      this.render();
    }
  }

  dispose(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }
    this.stateDisposable?.dispose();
    this.statusBarItem.dispose();
  }
}
