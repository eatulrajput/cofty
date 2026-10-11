import * as vscode from 'vscode';
import { StateMachine, CodingState } from './stateMachine';
import { Accumulator } from './accumulator';

/**
 * ActivityListener hooks into VS Code editor events to detect user activity.
 * It drives both the StateMachine (active/idle) and the Accumulator (buffer).
 *
 * Fix #5  — Scroll events removed; they inflate active time because the editor
 *            fires onDidChangeTextEditorVisibleRanges for every programmatic
 *            scroll too.  Idle-timer resets now come from genuine input only.
 * Fix #6  — Window focus handler guards against a focused non-editor pane
 *            (e.g. terminal or settings) so we don't record stale context.
 * Fix #7  — getGitBranch() matches the active document's path to the correct
 *            repository in multi-root workspaces instead of always using repo[0].
 */
export class ActivityListener {
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly stateMachine: StateMachine,
    private readonly accumulator: Accumulator,
  ) {}

  start(): void {
    // FR-1: Typing / document change events
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.contentChanges.length === 0) {
          return;
        }
        this.handleActivity(event.document);
      }),
    );

    // FR-1: Tab / file switch events
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
          this.handleActivity(editor.document);
        }
      }),
    );

    // FR-1: Window focus events
    // Fix #6: only treat focus as activity when an actual text editor is open;
    // focusing the terminal, settings, or sidebar should not mark state Active.
    this.disposables.push(
      vscode.window.onDidChangeWindowState((windowState) => {
        if (windowState.focused) {
          const doc = vscode.window.activeTextEditor?.document;
          if (doc) {
            this.handleActivity(doc);
          }
        }
      }),
    );

    // NOTE: scroll listener removed (Fix #5) — onDidChangeTextEditorVisibleRanges
    // fires on every programmatic scroll (e.g., go-to-definition, folding),
    // inflating active seconds and resetting the idle timer unfairly.

    console.log('[Cofty] ActivityListener started.');
  }

  private handleActivity(document?: vscode.TextDocument): void {
    const config = vscode.workspace.getConfiguration('cofty');
    if (!config.get<boolean>('trackingEnabled', true)) {
      return;
    }

    // Always call transitionTo — it updates lastActivityTime before its early-return
    // guard, so the idle timer resets correctly on every event even when already Active.
    this.stateMachine.transitionTo(CodingState.Active);

    // Update accumulator context from current document
    if (document) {
      this.accumulator.updateContext({
        fileExtension: this.getExtension(document.fileName),
        languageId: document.languageId,
        workspaceName: vscode.workspace.name ?? 'unknown',
        gitBranch: this.getGitBranch(document.uri),
      });
    }

    this.accumulator.recordActivity();
  }

  private getExtension(fileName: string): string {
    const parts = fileName.split('.');
    return parts.length > 1 ? `.${parts[parts.length - 1]}` : '';
  }

  /**
   * Fix #7: In a multi-root workspace there can be multiple Git repositories.
   * We match the active document's URI against each repo's rootUri so the
   * correct branch is recorded rather than always falling back to repos[0].
   */
  private getGitBranch(docUri?: vscode.Uri): string {
    try {
      const gitExtension = vscode.extensions.getExtension('vscode.git');
      if (!gitExtension?.isActive) {
        return 'unknown';
      }

      const git = gitExtension.exports.getAPI(1);
      const repos: any[] = git.repositories ?? [];

      if (repos.length === 0) {
        return 'unknown';
      }

      // Find the repo whose rootUri is a prefix of the document's path
      if (docUri) {
        const docPath = docUri.fsPath;
        const match = repos
          .filter((r) => r?.rootUri?.fsPath && docPath.startsWith(r.rootUri.fsPath))
          // prefer the longest (most specific) root match
          .sort((a, b) => b.rootUri.fsPath.length - a.rootUri.fsPath.length)[0];

        if (match) {
          return match.state?.HEAD?.name ?? 'unknown';
        }
      }

      // Fallback to first repo if no path match
      return repos[0]?.state?.HEAD?.name ?? 'unknown';
    } catch {
      // silently ignore — Git extension may not be present
    }
    return 'unknown';
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.disposables.length = 0;
  }
}
