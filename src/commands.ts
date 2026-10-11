import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Database } from './database';
import { Accumulator } from './accumulator';
import { StateMachine } from './stateMachine';
import { StatusBarController } from './statusBar';
import { WebviewPanel } from './webview/panel';

interface CommandDeps {
  database: Database;
  accumulator: Accumulator;
  stateMachine: StateMachine;
  statusBar: StatusBarController;
  webviewPanel: WebviewPanel;
}

export function registerCommands(
  context: vscode.ExtensionContext,
  deps: CommandDeps,
): void {
  // ─── Open Dashboard ───────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('cofty.openDashboard', () => {
      deps.webviewPanel.show();
    }),
  );

  // ─── Toggle Tracking ─────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('cofty.toggleTracking', async () => {
      const config = vscode.workspace.getConfiguration('cofty');
      const current = config.get<boolean>('trackingEnabled', true);
      await config.update(
        'trackingEnabled',
        !current,
        vscode.ConfigurationTarget.Global,
      );
      deps.statusBar.setTrackingState(!current);
      vscode.window.showInformationMessage(
        `Cofty tracking ${!current ? 'enabled ✅' : 'paused ⏸'}`,
      );
    }),
  );

  // ─── Export Data ─────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('cofty.exportData', async () => {
      const format = await vscode.window.showQuickPick(['JSON', 'CSV'], {
        placeHolder: 'Select export format',
        title: 'Cofty — Export Data',
      });

      if (!format) return;

      const ext = format === 'JSON' ? 'json' : 'csv';
      const saveUri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(
          path.join(
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '~',
            `cofty-export-${new Date().toISOString().slice(0, 10)}.${ext}`,
          ),
        ),
        filters: { [format]: [ext] },
      });

      if (!saveUri) return;

      const content =
        format === 'JSON'
          ? deps.database.exportAsJson()
          : deps.database.exportAsCsv();

      fs.writeFileSync(saveUri.fsPath, content, 'utf-8');
      vscode.window.showInformationMessage(
        `Cofty: Exported ${format} to ${saveUri.fsPath}`,
      );
    }),
  );

  // ─── Today's Summary ────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('cofty.viewStatus', () => {
      // Fix #1: sessionActiveSeconds is the single source of truth.
      // It is seeded from the DB at startup (getTodaySummary) and then
      // incremented live, so there is no need to add getTodaySummary() again —
      // that would double-count everything persisted before this session.
      const sessionActive = deps.accumulator.getSessionActiveSeconds();
      const sessionIdle   = deps.accumulator.getSessionIdleSeconds();

      const h = Math.floor(sessionActive / 3600);
      const m = Math.floor((sessionActive % 3600) / 60);
      const idleM = Math.floor(sessionIdle / 60);

      vscode.window.showInformationMessage(
        `Cofty Today — Active: ${h}h ${m}m | Idle: ${idleM}m`,
      );
    }),
  );

  // ─── Purge Old Data ──────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('cofty.purgeData', async () => {
      const config = vscode.workspace.getConfiguration('cofty');
      const days = config.get<number>('dataPurgeDays', 90);

      if (days === 0) {
        vscode.window.showWarningMessage(
          'Cofty: Auto-purge is set to "Never". Change cofty.dataPurgeDays to enable.',
        );
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        `Cofty: Permanently delete all records older than ${days} days?`,
        { modal: true },
        'Delete',
      );

      if (confirm !== 'Delete') return;

      const deleted = deps.database.purgeOlderThan(days);
      vscode.window.showInformationMessage(
        `Cofty: Removed ${deleted} old record(s).`,
      );
    }),
  );
}
