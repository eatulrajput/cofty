import * as vscode from 'vscode';

export enum CodingState {
  Active = 'active',
  Idle = 'idle',
}

type StateChangeListener = (newState: CodingState) => void;

/**
 * FR-2: State Machine managing Active ↔ Idle transitions.
 * Uses a polling interval to detect when the idle timeout has elapsed.
 */
export class StateMachine {
  private currentState: CodingState = CodingState.Idle;
  private lastActivityTime: number = Date.now();
  private idleCheckTimer: NodeJS.Timeout | undefined;
  private readonly listeners: StateChangeListener[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {}

  getState(): CodingState {
    return this.currentState;
  }

  getLastActivityTime(): number {
    return this.lastActivityTime;
  }

  /** Called by ActivityListener on each user event */
  transitionTo(newState: CodingState): void {
    if (newState === CodingState.Active) {
      this.lastActivityTime = Date.now();
    }

    if (this.currentState === newState) {
      return;
    }

    const prev = this.currentState;
    this.currentState = newState;
    console.log(`[Cofty] State: ${prev} → ${newState}`);
    this.listeners.forEach((fn) => fn(newState));

    if (newState === CodingState.Active) {
      this.startIdleWatch();
    }
  }

  recordActivity(): void {
    this.lastActivityTime = Date.now();
  }

  onStateChange(listener: StateChangeListener): vscode.Disposable {
    this.listeners.push(listener);
    return {
      dispose: () => {
        const idx = this.listeners.indexOf(listener);
        if (idx >= 0) {
          this.listeners.splice(idx, 1);
        }
      },
    };
  }

  /** Starts a background timer that detects idle timeout */
  private startIdleWatch(): void {
    this.clearIdleWatch();

    const check = (): void => {
      const config = vscode.workspace.getConfiguration('cofty');
      const timeoutMs = config.get<number>('idleTimeoutSeconds', 120) * 1000;
      const elapsed = Date.now() - this.lastActivityTime;

      if (elapsed >= timeoutMs && this.currentState === CodingState.Active) {
        this.transitionTo(CodingState.Idle);
      }
    };

    // Poll every 5 seconds for responsiveness
    this.idleCheckTimer = setInterval(check, 5_000);
  }

  private clearIdleWatch(): void {
    if (this.idleCheckTimer) {
      clearInterval(this.idleCheckTimer);
      this.idleCheckTimer = undefined;
    }
  }

  dispose(): void {
    this.clearIdleWatch();
    this.listeners.length = 0;
  }
}
