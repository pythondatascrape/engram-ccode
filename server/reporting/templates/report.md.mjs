/**
 * report.md.mjs — Markdown report template helpers.
 *
 * Provides static constants and pure formatting utilities used by formatter.mjs.
 * No business logic here — only presentation primitives.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SECTION_DIVIDER = '---\n';

// ---------------------------------------------------------------------------
// formatNumber(n) — formats numbers with commas (1234 → "1,234")
// ---------------------------------------------------------------------------

/**
 * @param {number} n
 * @returns {string}
 */
export function formatNumber(n) {
  if (typeof n !== 'number' || !isFinite(n)) return '0';
  return n.toLocaleString('en-US');
}

// ---------------------------------------------------------------------------
// formatTable(headers, rows) — simple markdown table generator
// ---------------------------------------------------------------------------

/**
 * @param {string[]} headers
 * @param {Array<string[]>} rows
 * @returns {string}
 */
export function formatTable(headers, rows) {
  if (!headers || headers.length === 0) return '';

  // Compute column widths (minimum = header length)
  const colWidths = headers.map((h) => h.length);
  for (const row of rows) {
    for (let i = 0; i < headers.length; i++) {
      const cell = row[i] ?? '';
      if (cell.length > colWidths[i]) colWidths[i] = cell.length;
    }
  }

  const pad = (s, w) => String(s ?? '').padEnd(w, ' ');

  const headerRow = '| ' + headers.map((h, i) => pad(h, colWidths[i])).join(' | ') + ' |';
  const separator = '| ' + colWidths.map((w) => '-'.repeat(w)).join(' | ') + ' |';
  const dataRows = rows.map(
    (row) => '| ' + headers.map((_, i) => pad(row[i] ?? '', colWidths[i])).join(' | ') + ' |'
  );

  return [headerRow, separator, ...dataRows].join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// formatPercent(ratio) — 0.8234 → "82.34%"
// ---------------------------------------------------------------------------

/**
 * @param {number} ratio  0–1
 * @returns {string}
 */
export function formatPercent(ratio) {
  if (typeof ratio !== 'number' || !isFinite(ratio)) return '0.00%';
  return (ratio * 100).toFixed(2) + '%';
}
