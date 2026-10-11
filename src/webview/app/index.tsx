import React, { useEffect, useState, Component, ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

// ── Brand Design Tokens (PRD §1.1) ───────────────────────────────────────────
const C = {
  bg:           '#0B090A',
  surface:      '#161214',
  accent:       '#F991CC',
  textMain:     '#F4F4F6',
  textMuted:    '#8E8A93',
  border:       '#2A2428',
  accentBg:     'rgba(249,145,204,0.07)',
  accentBorder: 'rgba(249,145,204,0.22)',
} as const;

// Segment color palette for language donut
const SEG_COLORS = [
  '#F991CC', '#a78bfa', '#60d9fa', '#34d399',
  '#f59e0b', '#f87171', '#818cf8', '#fb923c',
];

// ── Types ─────────────────────────────────────────────────────────────────────
interface DailySummary    { date: string; activeSeconds: number; idleSeconds: number; }
interface LanguageSummary { languageId: string; totalSeconds: number; }
interface ProjectSummary  { projectName: string; totalSeconds: number; }
interface DashboardData {
  daily: DailySummary[];
  languages: LanguageSummary[];
  projects: ProjectSummary[];
  today: { activeSeconds: number; idleSeconds: number };
  dbPath: string;
}

// ── VS Code API shim ──────────────────────────────────────────────────────────
declare function acquireVsCodeApi(): { postMessage: (msg: unknown) => void };
const vscode = acquireVsCodeApi();

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtSeconds(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
  return `${m}m ${(s % 60).toString().padStart(2, '0')}s`;
}

function fmtHours(s: number): string {
  return (s / 3600).toFixed(1) + 'h';
}

/**
 * Fix #13 — Build a local-timezone YYYY-MM-DD string from a Date object.
 * The previous implementation used `d.toISOString().slice(0, 10)` which
 * returns a UTC date; near midnight this shifts to yesterday/tomorrow in
 * timezones ahead of or behind UTC, breaking the streak counter.
 */
function localDateKey(d: Date): string {
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Fix #13 — calcStreak now uses localDateKey() instead of toISOString() so
 * streak detection works correctly in all timezones.
 */
function calcStreak(daily: DailySummary[]): number {
  const set = new Set(daily.filter(d => d.activeSeconds > 0).map(d => d.date));
  let streak = 0;
  const d = new Date();
  while (streak < 365) {
    const key = localDateKey(d);
    if (!set.has(key)) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

// ── Error Boundary ────────────────────────────────────────────────────────────
/**
 * Fix #16 — Wrap the dashboard in an ErrorBoundary so a bad DB payload or
 * a chart rendering error produces a friendly message instead of a blank panel.
 */
interface ErrorBoundaryState { hasError: boolean; message: string; }

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[Cofty] Dashboard render error:', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100vh', background: C.bg,
          color: C.textMuted, gap: 12, padding: 32,
        }}>
          <span style={{ fontSize: 32 }}>⚠️</span>
          <div style={{ fontSize: 14, color: C.textMain, fontWeight: 600 }}>Dashboard Error</div>
          <div style={{ fontSize: 12, color: C.textMuted, textAlign: 'center', maxWidth: 400 }}>
            {this.state.message || 'An unexpected error occurred rendering the dashboard.'}
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, opacity: 0.6, marginTop: 4 }}>
            Check the Developer Console for details.
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── SVG Donut Chart ───────────────────────────────────────────────────────────
function polar(cx: number, cy: number, r: number, a: number) {
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function segPath(cx: number, cy: number, oR: number, iR: number, a0: number, a1: number) {
  const gap = 0.025;
  const o0 = polar(cx, cy, oR, a0 + gap), o1 = polar(cx, cy, oR, a1 - gap);
  const i0 = polar(cx, cy, iR, a0 + gap), i1 = polar(cx, cy, iR, a1 - gap);
  const lg = a1 - a0 > Math.PI ? 1 : 0;
  return `M${o0.x},${o0.y} A${oR},${oR} 0 ${lg} 1 ${o1.x},${o1.y} L${i1.x},${i1.y} A${iR},${iR} 0 ${lg} 0 ${i0.x},${i0.y}Z`;
}

function DonutChart({ data }: { data: LanguageSummary[] }) {
  if (!data.length) return <Empty />;
  const total = data.reduce((s, d) => s + d.totalSeconds, 0);
  if (total === 0) return <Empty />;

  const cx = 90, cy = 90, oR = 74, iR = 50;
  let angle = -Math.PI / 2;
  const slices = data.slice(0, 8).map((d, i) => {
    const span = (d.totalSeconds / total) * Math.PI * 2;
    const path = segPath(cx, cy, oR, iR, angle, angle + span);
    angle += span;
    return { ...d, path, color: SEG_COLORS[i % SEG_COLORS.length], pct: Math.round((d.totalSeconds / total) * 100) };
  });

  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
      <svg width={180} height={180} viewBox="0 0 180 180" style={{ flexShrink: 0 }}>
        {slices.map((s, i) => <path key={i} d={s.path} fill={s.color} />)}
        <text x={cx} y={cy - 6}  textAnchor="middle" fill={C.accent}    fontSize={20} fontWeight={700}>{fmtHours(total)}</text>
        <text x={cx} y={cy + 13} textAnchor="middle" fill={C.textMuted} fontSize={10}>total</text>
      </svg>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 9 }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
            <div style={{ flex: 1, color: C.textMain, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.languageId}</div>
            <div style={{ color: C.textMuted, fontSize: 11 }}>{s.pct}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Activity Heatmap (GitHub-style, 13 weeks / 91 days) ───────────────────────
/**
 * Fix #11 — was generating 84 cells (i = 83..0) but DB returns 90 days; now
 *           generates 91 cells (13 full weeks) to match the query range and
 *           give a complete last-13-weeks view.
 *
 * Fix #12 — Columns now align to calendar weeks starting on Monday.
 *           Previously the grid was sliced every 7 cells starting from today,
 *           so "today" could land in the middle of a column.  Now we pad the
 *           start with empty cells until the first Monday boundary so columns
 *           always represent Mon→Sun weeks, matching GitHub's contribution graph.
 *
 * Fix #13 — localDateKey() used instead of toISOString() to stay in local time.
 */
function Heatmap({ daily }: { daily: DailySummary[] }) {
  const map = new Map(daily.map(d => [d.date, d.activeSeconds]));

  // Build a 91-day window (13 weeks) ending today — Fix #11
  const today = new Date();
  const rawCells: { date: string; sec: number }[] = [];
  for (let i = 90; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = localDateKey(d); // Fix #13: local timezone
    rawCells.push({ date: key, sec: map.get(key) ?? 0 });
  }

  // Fix #12: Pad the beginning so the grid starts on Monday (getDay() === 1)
  // getDay(): 0=Sun, 1=Mon, ..., 6=Sat
  const firstDate = new Date(today);
  firstDate.setDate(today.getDate() - 90);
  const firstDow = firstDate.getDay();
  // Days to subtract to reach the preceding Monday (0 = already Monday)
  const padDays = firstDow === 0 ? 6 : firstDow - 1;
  const paddedCells: ({ date: string; sec: number } | null)[] = [
    ...Array(padDays).fill(null),
    ...rawCells,
  ];

  // Group into columns of 7 days each (Mon–Sun)
  const weeks: (({ date: string; sec: number } | null)[])[] = [];
  for (let i = 0; i < paddedCells.length; i += 7) {
    weeks.push(paddedCells.slice(i, i + 7));
  }

  const max = Math.max(...rawCells.map(c => c.sec), 1);

  return (
    <div>
      <div style={{ display: 'flex', gap: 3 }}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {week.map((cell, di) => {
              if (!cell) {
                // Padding cell — render transparent placeholder
                return (
                  <div
                    key={di}
                    style={{ width: 12, height: 12, borderRadius: 2 }}
                  />
                );
              }
              const t = cell.sec === 0 ? 0 : 0.15 + (cell.sec / max) * 0.85;
              return (
                <div
                  key={di}
                  title={`${cell.date}: ${fmtSeconds(cell.sec)}`}
                  style={{
                    width: 12, height: 12, borderRadius: 2, cursor: 'default',
                    background: cell.sec === 0 ? C.surface : `rgba(249,145,204,${t})`,
                    border: `1px solid ${cell.sec > 0 ? 'rgba(249,145,204,0.18)' : C.border}`,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 10, color: C.textMuted }}>
        <span>Less</span>
        {[0.1, 0.3, 0.5, 0.7, 0.9].map((op, i) => (
          <div key={i} style={{ width: 12, height: 12, borderRadius: 2, background: `rgba(249,145,204,${op})` }} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

// ── Projects Bar Chart ────────────────────────────────────────────────────────
function ProjectBars({ data }: { data: ProjectSummary[] }) {
  if (!data.length) return <Empty />;
  const max = Math.max(...data.map(d => d.totalSeconds), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      {data.slice(0, 8).map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
          <div style={{ width: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: C.textMain }}>{d.projectName}</div>
          <div style={{ flex: 1, background: C.border, borderRadius: 3, height: 7, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 3, transition: 'width 0.5s ease',
              width: `${(d.totalSeconds / max) * 100}%`,
              background: 'linear-gradient(90deg,rgba(167,139,250,0.85),rgba(167,139,250,0.45))',
            }} />
          </div>
          <div style={{ width: 38, textAlign: 'right', color: C.textMuted, fontSize: 11 }}>{fmtHours(d.totalSeconds)}</div>
        </div>
      ))}
    </div>
  );
}

// ── Reusable UI Primitives ────────────────────────────────────────────────────
function StatCard({ label, value, sub, highlight = false }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div style={{
      background: highlight ? `linear-gradient(140deg, ${C.surface}, rgba(249,145,204,0.05))` : C.surface,
      border: `1px solid ${highlight ? C.accentBorder : C.border}`,
      borderRadius: 12, padding: '18px 20px',
    }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.textMuted, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.5px', color: highlight ? C.accent : C.textMain }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 24px' }}>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.textMuted, marginBottom: 18 }}>{title}</div>
      {children}
    </div>
  );
}

function Empty() {
  return <div style={{ color: C.textMuted, fontSize: 13, textAlign: 'center', padding: '36px 0' }}>No data yet — start coding!</div>;
}

// ── Main App ──────────────────────────────────────────────────────────────────
function App() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    vscode.postMessage({ type: 'ready' });
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'data') setData(e.data as DashboardData);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  if (!data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: C.bg }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          border: `3px solid ${C.border}`, borderTopColor: C.accent,
          animation: 'spin 0.8s linear infinite',
        }} />
        <p style={{ marginTop: 20, color: C.textMuted, fontSize: 13 }}>Loading Cofty Dashboard…</p>
      </div>
    );
  }

  const totalActiveToday = data.today.activeSeconds;
  const totalWeek  = data.daily.slice(-7).reduce((s, d) => s + d.activeSeconds, 0);
  const totalMonth = data.daily.reduce((s, d) => s + d.activeSeconds, 0);
  const streak     = calcStreak(data.daily);

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.textMain, padding: '28px 32px', fontFamily: `'Inter','Segoe UI',system-ui,sans-serif`, boxSizing: 'border-box' }}>
      <style>{`
        * { box-sizing: border-box; }
        @keyframes spin { to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 3px; }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ color: C.accent, fontSize: 18, lineHeight: 1 }}>◆</span>
          <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.5px' }}>Cofty</span>
        </div>
        <span style={{ color: C.textMuted, fontSize: 12 }}>Track your code time. Kept on your machine.</span>
      </div>

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(148px, 1fr))', gap: 14, marginBottom: 16 }}>
        <StatCard label="Today"      value={fmtSeconds(totalActiveToday)} sub="active coding"  highlight />
        <StatCard label="This Week"  value={fmtHours(totalWeek)}          sub="active hours"  />
        <StatCard label="This Month" value={fmtHours(totalMonth)}         sub="active hours"  />
        <StatCard label="Day Streak" value={`${streak}d`}                 sub="consecutive"   />
      </div>

      {/* Heatmap */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 24px', marginBottom: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.textMuted, marginBottom: 16 }}>
          Activity — Last 13 Weeks
        </div>
        <Heatmap daily={data.daily} />
      </div>

      {/* Language Donut + Projects */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
        <Section title="Language Breakdown"><DonutChart data={data.languages} /></Section>
        <Section title="Top Projects"><ProjectBars data={data.projects} /></Section>
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', color: C.textMuted, fontSize: 10, marginTop: 8, opacity: 0.7 }}>
        🔒 All data stored locally ·{' '}
        <code style={{ fontFamily: 'monospace', fontSize: 10 }}>{data.dbPath}</code>
      </div>
    </div>
  );
}

// ── Mount (wrapped in ErrorBoundary — Fix #16) ────────────────────────────────
const root = createRoot(document.getElementById('root')!);
root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
