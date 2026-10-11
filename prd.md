# **Product Requirement Document (PRD)**

## **Project Overview**

**Product Name:** Cofty  
**Tagline:** Cofty — Track your code time. Kept on your machine.  
**Primary Palette:** Dark (\#0B090A), Accent Pink (\#F991CC)  
**Document Version:** 2.1  
**Target Release:** Q4 2026  
Cofty is a privacy-first, local-only VS Code extension that tracks active coding duration, idle time, project metrics, and programming language breakdowns. Designed with a distinct dark aesthetic (\#0B090A) highlighted by a vibrant pink accent (\#F991CC), all telemetry data is processed in memory and written exclusively to an embedded SQLite database on the developer's local storage.

## **1\. Brand Identity & Visual Theme Guidelines**

### **1.1 Palette Matrix**

| Theme Role | Hex Code | Usage Target |
| :---- | :---- | :---- |
| **Primary Canvas** | \#0B090A | Dashboard background, sidebar container, status bar background. |
| **Accent Primary** | \#F991CC | Active coding indicators, primary buttons, chart highlight metrics, SVG accents. |
| **Surface Element** | \#161214 | Card containers, modal popovers, table headers inside Webviews. |
| **Text Primary** | \#F4F4F6 | Main headers, active session timer counters, body text. |
| **Text Muted** | \#8E8A93 | Idle timers, inactive branch tags, tooltips, secondary labels. |

### **1.2 Theme CSS Variable Mapping (VS Code Webview)**

CSS  
:root {  
  \--cofty-bg: \#0B090A;  
  \--cofty-surface: \#161214;  
  \--cofty-accent: \#F991CC;  
  \--cofty-text-main: \#F4F4F6;  
  \--cofty-text-muted: \#8E8A93;  
  \--cofty-border: \#2A2428;  
}

/\* Base Dashboard Container \*/  
.cofty-dashboard {  
  background-color: var(--cofty-bg);  
  color: var(--cofty-text-main);  
  font-family: var(--vscode-editor-font-family, 'Segoe UI', sans-serif);  
}

/\* Active Highlight Elements \*/  
.cofty-badge-active {  
  background-color: rgba(249, 145, 204, 0.15);  
  color: var(--cofty-accent);  
  border: 1px solid var(--cofty-accent);  
}

## **2\. Problem Statement & Core Value Proposition**

* **Problem:** Popular developer telemetry plugins sync source file names, directory paths, git branch tags, and daily timestamps to remote servers. This presents compliance hazards under strict security frameworks and offends developers who demand total data sovereignty.  
* **Value Proposition:** Zero network requests. Cofty provides local analytics, active vs. idle tracking, and project insight inside a UI crafted specifically in \#0B090A dark mode and \#F991CC vector accents.

## **3\. Product Objectives & Target Metrics**

| Metric | Target Standard |
| :---- | :---- |
| **Network Requests** | **0** (Zero external calls or outbound telemetry). |
| **Extension Footprint** | \< 25 MB disk storage; \< 30 MB RAM footprint. |
| **Idle Precision** | Transition state detection within a configurable 30s–600s threshold. |
| **Render Performance** | Webview dashboard launch latency \< 120 ms. |

## **4\. Functional Requirements**

### **4.1 Activity Engine & State Machine**

| ID | Feature | Description | Priority |
| :---- | :---- | :---- | :---- |
| **FR-1** | **Event Capturing** | Monitor document typing (onDidChangeTextDocument), file tab selection, and scroll events via VS Code APIs. | P0 |
| **FR-2** | **Idle State Transition** | Switch session state from Active to Idle when no keyboard or editor interaction occurs within the timeout limit (Default: 120s). | P0 |
| **FR-3** | **Context Association** | Tag recorded timestamps with Workspace Name, File Extension, Language ID, and Active Git Branch (git.branch). | P0 |
| **FR-4** | **Debounced DB Writes** | Accumulate telemetry in memory; write chunked records to SQLite every 60 seconds or immediately upon editor deactivation. | P0 |

### **4.2 Local Data Layer & Portability**

| ID | Feature | Description | Priority |
| :---- | :---- | :---- | :---- |
| **FR-5** | **WASM SQLite Storage** | Persist logs in cofty-data.db located inside VS Code's sandboxed context.globalStorageUri. | P0 |
| **FR-6** | **JSON/CSV Data Export** | One-click command to export raw coding logs for local recordkeeping or personal reporting. | P1 |
| **FR-7** | **Data Purging Policy** | Configuration setting to automatically purge records older than $N$ days (30, 90, 180, 365, or Never). | P1 |

### **4.3 Interface & Dashboard Components**

| ID | Feature | Description | Priority |
| :---- | :---- | :---- | :---- |
| **FR-8** | **Theme-Mapped Status Bar** | Render custom SVGs (\#F991CC active state, \#8E8A93 idle state) alongside live timer counters in the status bar. | P0 |
| **FR-9** | **Webview Analytics Tab** | Full-editor tab dashboard featuring an activity heatmap, language breakdown, and deep work trends set on \#0B090A. | P0 |
| **FR-10** | **Break Indicator Alerts** | Non-intrusive notifications when continuous typing exceeds user-defined limits (e.g., 90 minutes). | P2 |

## **5\. Technical Architecture**

Plaintext  
┌────────────────────────────────────────────────────────────────────────┐  
│                          VS Code Extension Host                        │  
│                                                                        │  
│  ┌───────────────────────┐             ┌───────────────────────────┐   │  
│  │ Activity Listener     │             │ Status Bar Controller     │   │  
│  │ (Keystrokes / Tabs)   │             │ (SVG Icons in \#F991CC)    │   │  
│  └───────────┬───────────┘             └─────────────▲─────────────┘   │  
│              │                                       │                 │  
│              ▼                                       │                 │  
│  ┌───────────────────────┐             ┌─────────────┴─────────────┐   │  
│  │ In-Memory Accumulator │             │ State Machine             │   │  
│  │ (Debounced Buffer)    ├────────────►│ (Active vs. Idle Logic)   │   │  
│  └───────────┬───────────┘             └───────────────────────────┘   │  
│              │                                                         │  
│              ▼ (Flush every 60s)                                       │  
│  ┌─────────────────────────────────────────────────────────────────┐   │  
│  │               Local Storage Engine (WASM SQLite)                │   │  
│  │        Stored in context.globalStorageUri/cofty-data.db        │   │  
│  └───────────────────────────────┬─────────────────────────────────┘   │  
│                                  │                                     │  
└──────────────────────────────────┼─────────────────────────────────────┘  
                                   │ PostMessage Bridge  
                                   ▼  
┌────────────────────────────────────────────────────────────────────────┐  
│                   VS Code Webview Dashboard Tab                        │  
│                                                                        │  
│  ┌──────────────────────────────────────────────────────────────────┐  │  
│  │             React Dashboard UI (\#0B090A Theme Canvas)             │  │  
│  │     (Activity Heatmap, Language Charts, Flow State Stats)        │  │  
│  └──────────────────────────────────────────────────────────────────┘  │  
└────────────────────────────────────────────────────────────────────────┘

## **6\. SQLite Database Schema**

SQL  
\-- Projects & Workspaces  
CREATE TABLE IF NOT EXISTS projects (  
    id INTEGER PRIMARY KEY AUTOINCREMENT,  
    name TEXT NOT NULL UNIQUE,  
    created\_at DATETIME DEFAULT CURRENT\_TIMESTAMP  
);

\-- Main Coding Telemetry Logs  
CREATE TABLE IF NOT EXISTS activity\_logs (  
    id INTEGER PRIMARY KEY AUTOINCREMENT,  
    project\_id INTEGER,  
    file\_extension TEXT,  
    language\_id TEXT,  
    git\_branch TEXT,  
    active\_seconds INTEGER NOT NULL DEFAULT 0,  
    idle\_seconds INTEGER NOT NULL DEFAULT 0,  
    created\_at DATETIME DEFAULT CURRENT\_TIMESTAMP,  
    FOREIGN KEY(project\_id) REFERENCES projects(id)  
);

\-- Indexing for Dashboard Query Acceleration  
CREATE INDEX IF NOT EXISTS idx\_activity\_created ON activity\_logs(created\_at);  
CREATE INDEX IF NOT EXISTS idx\_activity\_project ON activity\_logs(project\_id);

## **7\. Milestone Roadmap**

* **Phase 1: Core Engine & Local Persistence**  
  * File event listener and debounced buffer implementation.  
  * State transition machine (Active vs. Idle).  
  * WASM SQLite database setup in globalStorageUri.  
* **Phase 2: Status Bar & Brand Assets**  
  * Status bar integration featuring custom SVGs styled with \#F991CC.  
  * Command palette entries for quick session checks and tracking toggles.  
* **Phase 3: React Webview Dashboard**  
  * Full dashboard implementation using the \#0B090A / \#F991CC design system.  
  * Language distribution pie charts and GitHub-style contribution heatmaps.  
* **Phase 4: Data Control & Portability**  
  * One-click JSON/CSV export and data purge utilities.  
  * Git branch auto-tagging.

## **8\. Open Source & Contribution Strategy**

* **GitHub Repository Management**: Ensure `README.md` clearly states the value proposition, installation steps, and local privacy guarantees to encourage organic adoption.
* **Community Guidelines**: Maintain strict coding guidelines prioritizing data privacy. Reject any feature requests or PRs introducing external network telemetry or unapproved third-party tracking.
* **Issue Tracking**: Use GitHub Issues for transparent bug tracking and feature discussion while maintaining the zero-network footprint ethos.