/**
 * formatter.mjs — Markdown report generator and CSV savings log utilities.
 *
 * Consumes stats from ledger.getStats() and produces:
 *   - Full markdown session reports (formatReport)
 *   - One-line summary strings (formatSummaryLine)
 *   - CSV rows for the persistent savings log (formatCsvRow, appendToSavingsLog)
 */

import { writeFileSync, existsSync, appendFileSync } from 'node:fs';
import {
  formatTable,
  formatNumber,
  formatPercent,
  SECTION_DIVIDER,
} from './templates/report.md.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format an ISO timestamp for display.
 * @param {string} iso
 * @returns {string}
 */
function displayTime(iso) {
  try {
    return new Date(iso).toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso ?? '';
  }
}

/**
 * Compute duration in human-readable form between two ISO strings.
 * @param {string} start
 * @param {string} [end]
 * @returns {string}
 */
function duration(start, end) {
  const s = new Date(start);
  const e = end ? new Date(end) : new Date();
  const ms = e - s;
  if (isNaN(ms) || ms < 0) return 'unknown';
  const secs = Math.floor(ms / 1000);
  const mins = Math.floor(secs / 60);
  const hrs = Math.floor(mins / 60);
  if (hrs > 0) return `${hrs}h ${mins % 60}m`;
  if (mins > 0) return `${mins}m ${secs % 60}s`;
  return `${secs}s`;
}

/**
 * Build dimension-frequency map from all redundancy matches.
 * @param {Array<{matches: string[]}>} redundancies
 * @returns {Map<string, number>}
 */
function dimensionFrequency(redundancies) {
  const freq = new Map();
  for (const r of redundancies) {
    for (const dim of r.matches) {
      freq.set(dim, (freq.get(dim) ?? 0) + 1);
    }
  }
  return freq;
}

// ---------------------------------------------------------------------------
// formatReport(stats, options)
// ---------------------------------------------------------------------------

/**
 * Generate a full markdown report from session stats.
 *
 * @param {object} stats  — from ledger.getStats()
 * @param {object} [options]
 * @param {string} [options.name]
 * @param {string} [options.description]
 * @param {object} [options.codebook]         — active codebook dimensions object
 * @param {{model: string, inputPer1k: number}} [options.pricing]
 * @returns {string}
 */
export function formatReport(stats, options = {}) {
  const {
    sessionStart,
    compressions = [],
    redundancies = [],
    totalOriginalTokens,
    totalCompressedTokens,
    totalSaved,
    totalRedundancyHits,
    totalRedundantTokens,
    overallRatio,
  } = stats;

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { dateStyle: 'medium' });
  const timeStr = now.toLocaleTimeString('en-US', { timeStyle: 'short' });

  const name = options.name ?? `Session Report — ${dateStr} ${timeStr}`;
  const combinedSaved = totalSaved + totalRedundantTokens;
  const description =
    options.description ??
    `Engram session: saved ~${formatNumber(combinedSaved)} tokens across ${compressions.length} compression event(s) and ${totalRedundancyHits} redundancy hit(s).`;

  const lines = [];

  // ── 1. Header ──────────────────────────────────────────────────────────────
  lines.push(`# ${name}\n`);
  lines.push(`${description}\n`);
  lines.push(SECTION_DIVIDER);

  // ── 2. Session Summary ─────────────────────────────────────────────────────
  lines.push('## Session Summary\n');
  lines.push(`- **Started:** ${displayTime(sessionStart)}`);
  lines.push(`- **Duration:** ${duration(sessionStart)}`);
  lines.push(`- **Compression events:** ${formatNumber(compressions.length)}`);
  lines.push(`- **Redundancy hits:** ${formatNumber(totalRedundancyHits)}`);
  lines.push('');
  lines.push(SECTION_DIVIDER);

  // ── 3. Compression Stats ───────────────────────────────────────────────────
  lines.push('## Compression Stats\n');
  if (compressions.length === 0) {
    lines.push('_No compression events recorded._\n');
  } else {
    const headers = ['#', 'Time', 'Original', 'Compressed', 'Saved', 'Ratio'];
    const rows = compressions.map((c, i) => [
      String(i + 1),
      displayTime(c.timestamp),
      formatNumber(c.originalTokens),
      formatNumber(c.compressedTokens),
      formatNumber(c.saved),
      formatPercent(c.ratio),
    ]);
    lines.push(formatTable(headers, rows));
  }
  lines.push(SECTION_DIVIDER);

  // Pre-compute dimension frequency (used in sections 4 and 6)
  const freq = dimensionFrequency(redundancies);

  // ── 4. Redundancy Stats ────────────────────────────────────────────────────
  lines.push('## Redundancy Stats\n');
  if (redundancies.length === 0) {
    lines.push('_No redundancy hits recorded._\n');
  } else {
    lines.push(`- **Total hits:** ${formatNumber(totalRedundancyHits)}`);
    lines.push(`- **Total redundant tokens detected:** ${formatNumber(totalRedundantTokens)}`);
    lines.push('');

    // Top redundant dimensions
    if (freq.size > 0) {
      lines.push('**Top redundant dimensions:**\n');
      const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
      const headers = ['Dimension', 'Hits'];
      const rows = sorted.map(([dim, count]) => [dim, formatNumber(count)]);
      lines.push(formatTable(headers, rows));
    }
  }
  lines.push(SECTION_DIVIDER);

  // ── 5. Cumulative Savings ──────────────────────────────────────────────────
  lines.push('## Cumulative Savings\n');
  lines.push(`- **Total tokens saved (compression):** ${formatNumber(totalSaved)}`);
  lines.push(`- **Total redundant tokens noted:** ${formatNumber(totalRedundantTokens)}`);
  lines.push(`- **Combined savings:** ${formatNumber(combinedSaved)}`);
  lines.push(`- **Overall compression ratio:** ${formatPercent(overallRatio)}`);

  if (options.pricing) {
    const { model, inputPer1k } = options.pricing;
    const costSaved = (combinedSaved / 1000) * inputPer1k;
    lines.push(`- **Estimated cost saved (${model}):** $${costSaved.toFixed(4)}`);
  }
  lines.push('');
  lines.push(SECTION_DIVIDER);

  // ── 6. Per-Dimension Breakdown ─────────────────────────────────────────────
  lines.push('## Per-Dimension Breakdown\n');
  if (freq.size === 0) {
    lines.push('_No dimension matches recorded._\n');
  } else {
    const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
    const headers = ['Dimension', 'Match Count', 'Share'];
    const total = [...freq.values()].reduce((a, b) => a + b, 0);
    const rows = sorted.map(([dim, count]) => [
      dim,
      formatNumber(count),
      formatPercent(total > 0 ? count / total : 0),
    ]);
    lines.push(formatTable(headers, rows));
  }
  lines.push(SECTION_DIVIDER);

  // ── 7. Active Codebook ─────────────────────────────────────────────────────
  lines.push('## Active Codebook\n');
  if (!options.codebook || Object.keys(options.codebook).length === 0) {
    lines.push('_No codebook dimensions loaded._\n');
  } else {
    lines.push('```');
    for (const [key, value] of Object.entries(options.codebook)) {
      lines.push(`${key}=${value}`);
    }
    lines.push('```\n');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// formatSummaryLine(stats)
// ---------------------------------------------------------------------------

/**
 * One-line summary for notifications.
 * Example: "Saved ~1,234 tokens (82.00% reduction) | 5 redundancy hits"
 *
 * @param {object} stats  — from ledger.getStats()
 * @returns {string}
 */
export function formatSummaryLine(stats) {
  const {
    totalSaved = 0,
    totalRedundantTokens = 0,
    overallRatio = 0,
    totalRedundancyHits = 0,
  } = stats;

  const combined = totalSaved + totalRedundantTokens;
  return (
    `Saved ~${formatNumber(combined)} tokens (${formatPercent(overallRatio)} reduction)` +
    ` | ${formatNumber(totalRedundancyHits)} redundancy hit${totalRedundancyHits === 1 ? '' : 's'}`
  );
}

// ---------------------------------------------------------------------------
// CSV savings log
// ---------------------------------------------------------------------------

/** @type {string} */
export const CSV_HEADER =
  'timestamp,reportName,totalOriginalTokens,totalCompressedTokens,totalSaved,overallRatio,redundancyHits\n';

/**
 * Format a single CSV row for the savings log.
 *
 * @param {object} stats       — from ledger.getStats()
 * @param {string} reportName  — label for this entry
 * @returns {string}           — CSV row (without trailing newline)
 */
export function formatCsvRow(stats, reportName) {
  const {
    totalOriginalTokens = 0,
    totalCompressedTokens = 0,
    totalSaved = 0,
    overallRatio = 0,
    totalRedundancyHits = 0,
  } = stats;

  const timestamp = new Date().toISOString();
  // Escape reportName: wrap in quotes if it contains commas or quotes
  const safeName = `"${String(reportName ?? '').replace(/"/g, '""')}"`;

  return [
    timestamp,
    safeName,
    totalOriginalTokens,
    totalCompressedTokens,
    totalSaved,
    overallRatio,
    totalRedundancyHits,
  ].join(',');
}

/**
 * Append a CSV row to the savings log file.
 * Creates the file with header if it does not yet exist.
 *
 * @param {string} logPath  — absolute or relative path to the CSV file
 * @param {string} csvRow   — from formatCsvRow()
 * @returns {void}
 */
export function appendToSavingsLog(logPath, csvRow) {
  if (!existsSync(logPath)) {
    writeFileSync(logPath, CSV_HEADER, 'utf8');
  }
  appendFileSync(logPath, csvRow + '\n', 'utf8');
}
