import * as vscode from 'vscode';
import { Database } from '../database';

/**
 * FR-8: Dashboard WebviewPanel controller.
 * Hosts the React app (dist/webview.js) in a VS Code WebviewPanel.
 *
 * Fix #10 — Data was only sent once when the panel first opened.
 *            A 60-second refresh timer now keeps the dashboard live while
 *            it is visible. The timer is cleared when the panel is disposed.
 */
export class WebviewPanel {
  private panel: vscode.WebviewPanel | undefined;
  private refreshTimer: NodeJS.Timeout | undefined;
  private readonly extensionUri: vscode.Uri;

  private static readonly REFRESH_INTERVAL_MS = 60_000;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly database: Database,
  ) {
    this.extensionUri = context.extensionUri;
  }

  /** Opens (or reveals) the dashboard panel. */
  show(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      this.sendData();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'coftyDashboard',
      'Cofty Dashboard',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, 'dist'),
          vscode.Uri.joinPath(this.extensionUri, 'media'),
        ],
        retainContextWhenHidden: true,
      },
    );

    this.panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'media', 'icon.png');
    this.panel.webview.html = this.getHtml(this.panel.webview);

    // Send initial data once the webview signals it's ready
    this.panel.webview.onDidReceiveMessage(
      (msg) => {
        if (msg.type === 'ready') {
          this.sendData();
          this.startRefreshTimer(); // Fix #10: begin periodic refresh
        }
      },
      undefined,
      this.context.subscriptions,
    );

    this.panel.onDidDispose(
      () => {
        this.stopRefreshTimer(); // Fix #10: clean up timer on close
        this.panel = undefined;
      },
      undefined,
      this.context.subscriptions,
    );
  }

  /** Push fresh data to the webview React app. */
  private sendData(): void {
    if (!this.panel) return;

    const payload = {
      type: 'data',
      daily: this.database.getDailySummary(90),
      languages: this.database.getLanguageSummary(30),
      projects: this.database.getProjectSummary(30),
      today: this.database.getTodaySummary(),
      dbPath: this.database.getDbPath(),
    };

    this.panel.webview.postMessage(payload);
  }

  /**
   * Fix #10: Start a 60-second refresh cycle that keeps dashboard data live
   * while the panel is open, matching the accumulator flush interval.
   */
  private startRefreshTimer(): void {
    this.stopRefreshTimer();
    this.refreshTimer = setInterval(() => this.sendData(), WebviewPanel.REFRESH_INTERVAL_MS);
  }

  private stopRefreshTimer(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.js'),
    );

    const nonce = getNonce();

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             script-src 'nonce-${nonce}';
             style-src ${webview.cspSource} 'unsafe-inline';
             img-src ${webview.cspSource} data:;" />
  <title>Cofty Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); font-family: var(--vscode-font-family); }
    #root { min-height: 100vh; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
