# Cofty

> **Cofty — Track your code time. Kept on your machine.**

Cofty is a privacy-first, local-only VS Code extension that tracks your active coding duration, idle time, project metrics, and programming language breakdowns. Designed with a distinct dark aesthetic (`#0B090A`) highlighted by a vibrant pink accent (`#F991CC`), all telemetry data is processed in memory and written exclusively to an embedded SQLite database on your local machine.

**Zero network requests. Total data sovereignty.**

## ✨ Features

- **Local Analytics**: Activity tracking with zero external calls or outbound telemetry. All data is kept securely on your local storage (`cofty-data.db`).
- **Activity Engine**: Accurately monitors keystrokes and editor events, with configurable idle timeouts (default 120s) to distinguish active coding from idle time.
- **Contextual Tracking**: Automatically tags time with Workspace Name, File Extension, Language ID, and Active Git Branch.
- **Webview Dashboard**: A beautiful React-based dashboard tab built with Recharts, featuring activity heatmaps, language breakdown, and flow state stats—all seamlessly integrated into VS Code's dark theme.
- **Data Portability**: One-click JSON/CSV data export and configurable data purging policies (e.g., auto-purge records older than 90 days).
- **Status Bar Integration**: Real-time timer counters and active/idle SVG indicators (`#F991CC` for active, `#8E8A93` for idle).

## 🚀 Installation

*Note: Cofty is currently under development. To install it locally:*

1. Clone the repository:
   ```bash
   git clone https://github.com/cofty/cofty.git
   cd cofty
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Compile the extension:
   ```bash
   npm run compile
   ```
4. Press `F5` in VS Code to launch a new Extension Development Host window with Cofty loaded, or package it into a `.vsix` file using `vsce`:
   ```bash
   npm run package
   ```
   Then install the generated `.vsix` file in VS Code.

## ⚙️ Configuration

Cofty is highly customizable. In your `settings.json`, you can configure:

- `cofty.idleTimeoutSeconds`: Seconds of inactivity before switching to Idle state (default: 120, min: 30, max: 600).
- `cofty.breakReminderMinutes`: Alert after continuous active coding minutes (default: 90). Set 0 to disable.
- `cofty.dataPurgeDays`: Auto-purge records older than N days (default: 90). Options: 30, 90, 180, 365, or 0 (never).
- `cofty.trackingEnabled`: Enable or disable activity tracking globally.

## ⌨️ Commands

Access these via the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`):

- **Cofty: Open Dashboard** (`Ctrl+Shift+Y` / `Cmd+Shift+Y`) - Launch the analytics tab.
- **Cofty: Toggle Tracking** - Pause or resume time tracking.
- **Cofty: View Today's Summary** - Quick status check.
- **Cofty: Export Data (JSON / CSV)** - Export your telemetry data.
- **Cofty: Purge Old Data** - Manually trigger data cleanup.

## 🛡️ Privacy & Security

We believe in strict data sovereignty. Cofty makes **0** network requests. Everything stays on your machine, always. 

## 📝 License

This project is licensed under the MIT License.
