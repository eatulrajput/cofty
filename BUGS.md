Based on an analysis of the Cofty codebase, the bugs (which appear to be recently identified or addressed in the source code via `Fix #...` comments) can be categorized and prioritized as follows:

### 🔴 High Priority (Data Loss, Core Logic Errors, & Resource Leaks)

1. **Bug #17: Data Loss on Extension Deactivation** [X]
   * **Issue:** When VS Code was closed, the final telemetry data flush could be silently dropped because the `deactivate` function did not await the asynchronous database write, losing up to 60 seconds of tracked time.
   * **Location:** `src/extension.ts`
2. **Bug #1: Double-Counting Today's Activity**
   * **Issue:** The "View Today's Summary" command was erroneously adding the database's existing daily total to the live session counter (which was already seeded with the database total on startup), resulting in heavily inflated, double-counted stats.
   * **Location:** `src/commands.ts`
3. **Bug #4: Timer Resource Leak**
   * **Issue:** The background timer (`setInterval`) used to poll for idle states was not properly cleared when the extension deactivated, leading to a resource leak in the VS Code extension host.
   * **Location:** `src/extension.ts`
4. **Bug #16: Dashboard Crash on Bad Payload**
   * **Issue:** A bad database payload could crash the entire dashboard webview. It is now wrapped in an `ErrorBoundary` to gracefully handle errors.
   * **Location:** `src/webview/app/index.tsx`

### 🟡 Medium Priority (Accuracy, Data Integrity, & Performance)

5. **Bug #5: Inflated Active Time from Programmatic Scrolling**
   * **Issue:** Scroll events (`onDidChangeTextEditorVisibleRanges`) were triggering activity. This caused programmatic scrolls (e.g., "Go to Definition" or folding code) to unfairly reset the idle timer and inflate active coding time.
   * **Location:** `src/activityListener.ts`
6. **Bug #6: Stale Context on Terminal/Settings Focus**
   * **Issue:** Focusing non-text-editor panes (like the VS Code terminal or settings UI) was still being treated as coding activity, which incorrectly logged time against the last focused text file (stale context).
   * **Location:** `src/activityListener.ts`
7. **Bug #7: Incorrect Git Branch in Multi-Root Workspaces**
   * **Issue:** The Git context tracker always defaulted to the first repository (`repo[0]`). In multi-root workspaces, this caused time spent in subsequent repositories to be logged against the wrong Git branch.
   * **Location:** `src/activityListener.ts`
8. **Bug #8: Ghost Projects Appearing in Dashboard**
   * **Issue:** The data purge feature (`purgeOlderThan`) deleted old telemetry logs but failed to remove orphaned project records, resulting in 0-second "ghost" entries cluttering the project breakdown charts.
   * **Location:** `src/database.ts`
9. **Bug #3: CSV Export Data Corruption**
   * **Issue:** Project or branch names containing commas would break the structure of the CSV export. (It now correctly escapes quotes and wraps fields per RFC-4180).
   * **Location:** `src/database.ts`
10. **Bug #9: SQLite Query Performance Inefficiency**
    * **Issue:** Prepared database statements were being redundantly re-created on every 60-second flush rather than being cached once during database initialization.
    * **Location:** `src/database.ts`
11. **Bug #10: Dashboard Not Updating Automatically**
    * **Issue:** Data was only sent once when the webview panel first opened, causing the dashboard to become stale. It now uses a 60-second periodic refresh.
    * **Location:** `src/webview/panel.ts`
12. **Bug #13: Incorrect Timezone in Streak Calculation**
    * **Issue:** The streak calculation was using `toISOString()` (UTC time), causing streaks to calculate incorrectly based on the local timezone. It now uses a local-timezone date key.
    * **Location:** `src/webview/app/index.tsx`

### 🟢 Low Priority (UX, UI, & Minor Glitches)

13. **Bug #2: Break Reminder Only Firing Once**
    * **Issue:** The continuous coding break reminder (e.g., every 90 minutes) would only trigger once per session instead of repeatedly on a modulo interval.
    * **Location:** `src/accumulator.ts`
14. **Bug #14: Status Bar Colors Breaking in Light Themes**
    * **Issue:** The status bar used `statusBarItem.color` for its background tint, which is deprecated for backgrounds in newer VS Code API versions. This caused the status bar to render improperly or lack contrast on certain themes. 
    * **Location:** `src/statusBar.ts`
15. **Bug #11: Incorrect Heatmap Cell Count**
    * **Issue:** The heatmap was generating 84 cells but the DB returns 90 days of data. It now correctly builds a 91-day (13 weeks) window ending today.
    * **Location:** `src/webview/app/index.tsx`
16. **Bug #12: Heatmap Week Alignment**
    * **Issue:** Heatmap columns did not align with calendar weeks. They now correctly pad the beginning so the grid starts on a Monday.
    * **Location:** `src/webview/app/index.tsx`

