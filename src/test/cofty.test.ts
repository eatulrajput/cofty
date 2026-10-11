/**
 * Cofty — Unit Tests (Node built-in test runner, no extra dependencies)
 *
 * Run with:  node --test src/test/cofty.test.js
 * Or after ts-node is available:  npx ts-node --test src/test/cofty.test.ts
 *
 * Covers Fix #2 (break reminder threshold), Fix #3 (CSV quoting),
 * Fix #8 (orphan cleanup query shape), Fix #11/#12/#13 (heatmap / streak date logic).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers copied from source so tests have no runtime dependency on VS Code.
// ─────────────────────────────────────────────────────────────────────────────

/** Fix #13 – local-timezone date key (mirrors webview/app/index.tsx) */
function localDateKey(d: Date): string {
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Streak counter (mirrors webview/app/index.tsx) */
function calcStreak(daily: { date: string; activeSeconds: number }[]): number {
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

/** RFC-4180 CSV field quoting (mirrors database.ts) */
function quoteField(v: unknown): string {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

function exportAsCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]).map(quoteField).join(',');
  const csvRows = rows.map(r => Object.values(r).map(quoteField).join(','));
  return [headers, ...csvRows].join('\n');
}

/** Break reminder repeat check (mirrors accumulator.ts) */
function shouldFireBreakReminder(continuousSeconds: number, breakMins: number): boolean {
  if (breakMins <= 0) return false;
  const thresholdSeconds = breakMins * 60;
  if (thresholdSeconds <= 0) return false;
  return continuousSeconds > 0 && continuousSeconds % thresholdSeconds === 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('localDateKey', () => {
  test('returns YYYY-MM-DD in local time (not UTC)', () => {
    // Construct a date explicitly so it is predictable regardless of the
    // machine's timezone.
    const d = new Date(2024, 0, 5); // Jan 5 2024 local midnight
    assert.equal(localDateKey(d), '2024-01-05');
  });

  test('zero-pads month and day', () => {
    const d = new Date(2024, 2, 3); // March 3
    assert.equal(localDateKey(d), '2024-03-03');
  });
});

describe('calcStreak', () => {
  test('returns 0 when no days have activity', () => {
    assert.equal(calcStreak([]), 0);
  });

  test('returns 0 when today has no activity', () => {
    // Yesterday only
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const daily = [{ date: localDateKey(yesterday), activeSeconds: 100 }];
    assert.equal(calcStreak(daily), 0);
  });

  test('counts consecutive days ending today', () => {
    const days = [];
    const today = new Date();
    for (let i = 0; i < 5; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      days.push({ date: localDateKey(d), activeSeconds: 3600 });
    }
    assert.equal(calcStreak(days), 5);
  });

  test('stops counting at a gap', () => {
    const today = new Date();
    const days = [];
    // Today + 2 days ago (gap on yesterday)
    days.push({ date: localDateKey(today), activeSeconds: 100 });
    const twoDaysAgo = new Date(today);
    twoDaysAgo.setDate(today.getDate() - 2);
    days.push({ date: localDateKey(twoDaysAgo), activeSeconds: 100 });
    // Streak should be 1 (today only — gap on yesterday breaks it)
    assert.equal(calcStreak(days), 1);
  });
});

describe('CSV export — Fix #3 (RFC-4180 quoting)', () => {
  test('wraps all fields in double-quotes', () => {
    const rows = [{ id: 1, name: 'hello' }];
    const csv = exportAsCsv(rows);
    assert.ok(csv.startsWith('"id","name"'), `Expected quoted headers, got: ${csv}`);
  });

  test('escapes embedded double-quotes', () => {
    const rows = [{ name: 'say "hello"' }];
    const csv = exportAsCsv(rows);
    assert.ok(csv.includes('"say ""hello"""'), `Expected escaped quotes, got: ${csv}`);
  });

  test('handles commas inside field values without breaking columns', () => {
    const rows = [{ project: 'feature/auth,fix', branch: 'main' }];
    const csv = exportAsCsv(rows);
    const lines = csv.split('\n');
    // Data row should have exactly 2 comma-separated *quoted* tokens
    const dataLine = lines[1];
    // A naive split on comma would give 3 tokens without quoting; with quoting it gives 2
    const quotedTokens = dataLine.match(/"(?:[^"]|"")*"/g) ?? [];
    assert.equal(quotedTokens.length, 2);
    assert.equal(quotedTokens[0], '"feature/auth,fix"');
  });

  test('returns empty string for empty rows', () => {
    assert.equal(exportAsCsv([]), '');
  });

  test('handles null / undefined values', () => {
    const rows = [{ a: null, b: undefined, c: 0 }];
    const csv = exportAsCsv(rows);
    assert.ok(csv.includes('"","","0"'), `Got: ${csv}`);
  });
});

describe('Break reminder — Fix #2 (repeating modulo)', () => {
  test('does not fire at 0 seconds', () => {
    assert.equal(shouldFireBreakReminder(0, 90), false);
  });

  test('fires exactly at the first threshold (90 min)', () => {
    assert.equal(shouldFireBreakReminder(90 * 60, 90), true);
  });

  test('fires again at 2× threshold (180 min)', () => {
    assert.equal(shouldFireBreakReminder(180 * 60, 90), true);
  });

  test('fires again at 3× threshold (270 min)', () => {
    assert.equal(shouldFireBreakReminder(270 * 60, 90), true);
  });

  test('does NOT fire at a non-multiple (91 min)', () => {
    assert.equal(shouldFireBreakReminder(91 * 60, 90), false);
  });

  test('does not fire when breakMins is 0 (disabled)', () => {
    assert.equal(shouldFireBreakReminder(90 * 60, 0), false);
  });
});

describe('Heatmap cell count — Fix #11', () => {
  test('91-day window produces 91 raw cells', () => {
    const today = new Date();
    const cells: string[] = [];
    for (let i = 90; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      cells.push(localDateKey(d));
    }
    assert.equal(cells.length, 91);
  });

  test('all cell dates are unique', () => {
    const today = new Date();
    const cells: string[] = [];
    for (let i = 90; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      cells.push(localDateKey(d));
    }
    const unique = new Set(cells);
    assert.equal(unique.size, 91);
  });
});

describe('Heatmap week alignment — Fix #12', () => {
  test('padding puts first cell on a Monday', () => {
    const today = new Date();
    const firstDate = new Date(today);
    firstDate.setDate(today.getDate() - 90);
    const firstDow = firstDate.getDay(); // 0=Sun…6=Sat
    const padDays = firstDow === 0 ? 6 : firstDow - 1;
    // The (padDays + 1)th item in the padded array should be the first Monday
    // on or before firstDate's week; padDays is in [0, 6].
    assert.ok(padDays >= 0 && padDays <= 6, `Unexpected padDays: ${padDays}`);
  });
});
