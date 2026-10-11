import * as vscode from 'vscode';
import { ActivityListener } from './activityListener';
import { StateMachine } from './stateMachine';
import { Accumulator } from './accumulator';
import { Database } from './database';
import { StatusBarController } from './statusBar';
import { registerCommands } from './commands';
import { WebviewPanel } from './webview/panel';

let database: Database | undefined;
let accumulator: Accumulator | undefined;
let stateMachine: StateMachine | undefined;
let activityListener: ActivityListener | undefined;
let statusBar: StatusBarController | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('[Cofty] Activating...');

  // 1. Init database
  database = new Database(context.globalStorageUri);
  await database.initialize();

  // 2. Init state machine
  stateMachine = new StateMachine(context);

  // 3. Init accumulator (writes to DB, feeds status bar)
  accumulator = new Accumulator(database, stateMachine);

  // 4. Init status bar
  statusBar = new StatusBarController(context, stateMachine, accumulator);

  // 5. Init activity listener (feeds accumulator + state machine)
  activityListener = new ActivityListener(context, stateMachine, accumulator);

  // 6. Register all commands
  const webviewPanel = new WebviewPanel(context, database);
  registerCommands(context, {
    database,
    accumulator,
    stateMachine,
    statusBar,
    webviewPanel,
  });

  // 7. Start everything
  activityListener.start();
  statusBar.start();
  accumulator.start();

  console.log('[Cofty] Active ✅');
}

// Fix #17: deactivate is async so the final flush completes before the
// extension host process exits — previously data written in the last ~60 s
// could be silently dropped.
export async function deactivate(): Promise<void> {
  console.log('[Cofty] Deactivating — flushing data...');
  await accumulator?.flushNow();   // #17: await the async flush
  activityListener?.dispose();
  statusBar?.dispose();
  accumulator?.dispose();
  stateMachine?.dispose();         // #4: was missing — leaked the idle setInterval
  database?.close();
  console.log('[Cofty] Deactivated.');
}
