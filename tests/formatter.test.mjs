/**
 * formatter.test.mjs — Tests for the reporting engine.
 *
 * Run with: node --test tests/formatter.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  formatReport,
  formatSummaryLine,
  formatCsvRow,
  CSV_HEADER,
  appendToSavingsLog,
} from '../server/reporting/formatter.mjs';

import {
  formatTable,
  formatNumber,
  formatPercent,
  SECTION_DIVIDER,
} from '../server/reporting/templates/report.md.mjs';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeStats(overrides = {}) {
  return {
    sessionStart: '2026-03-27T07:00:00.000Z',
    compressions: [
      {
        timestamp: '2026-03-27T07:00:01.000Z',
        originalTokens: 500,
        compressedTokens: 75,
        saved: 425,
        ratio: 0.85,
      },
    ],
    redundancies: [
      { timestamp: '2026-03-27T07:01:00.000Z', matches: ['lang', 'err_style'], tokens: 120 },
      { timestamp: '2026-03-27T07:02:00.000Z', matches: ['lang'], tokens: 60 },
    ],
    totalOriginalTokens: 500,
    totalCompressedTokens: 75,
    totalSaved: 425,
    totalRedundancyHits: 2,
    totalRedundantTokens: 180,
    overallRatio: 0.85,
    ...overrides,
  };
}

function emptyStats() {
  return {
    sessionStart: '2026-03-27T07:00:00.000Z',
    compressions: [],
    redundancies: [],
    totalOriginalTokens: 0,
    totalCompressedTokens: 0,
    totalSaved: 0,
    totalRedundancyHits: 0,
    totalRedundantTokens: 0,
    overallRatio: 0,
  };
}

// ---------------------------------------------------------------------------
// Template helpers
// ---------------------------------------------------------------------------

test('formatNumber: basic formatting', () => {
  assert.equal(formatNumber(0), '0');
  assert.equal(formatNumber(1234), '1,234');
  assert.equal(formatNumber(1234567), '1,234,567');
  assert.equal(formatNumber(999), '999');
});

test('formatNumber: non-finite values return "0"', () => {
  assert.equal(formatNumber(NaN), '0');
  assert.equal(formatNumber(Infinity), '0');
  assert.equal(formatNumber('not a number'), '0');
});

test('formatPercent: converts ratio to percent string', () => {
  assert.equal(formatPercent(0.85), '85.00%');
  assert.equal(formatPercent(0), '0.00%');
  assert.equal(formatPercent(1), '100.00%');
  assert.equal(formatPercent(0.1234), '12.34%');
});

test('formatPercent: handles non-finite gracefully', () => {
  assert.equal(formatPercent(NaN), '0.00%');
  assert.equal(formatPercent(Infinity), '0.00%');
});

test('SECTION_DIVIDER: is correct', () => {
  assert.equal(SECTION_DIVIDER, '---\n');
});

test('formatTable: generates valid markdown table', () => {
  const result = formatTable(['Name', 'Count'], [['alpha', '1'], ['beta', '200']]);
  assert.ok(result.includes('| Name  | Count |'));
  assert.ok(result.includes('| ----- | ----- |'));
  assert.ok(result.includes('| alpha | 1     |'));
  assert.ok(result.includes('| beta  | 200   |'));
});

test('formatTable: single row', () => {
  const result = formatTable(['A', 'B'], [['x', 'y']]);
  assert.ok(result.includes('| A | B |'));
  assert.ok(result.includes('| x | y |'));
});

test('formatTable: empty rows returns header+separator only', () => {
  const result = formatTable(['Col'], []);
  assert.ok(result.includes('| Col |'));
  assert.ok(result.includes('| --- |'));
  // No data rows
  const dataLines = result.trim().split('\n').slice(2);
  assert.equal(dataLines.filter((l) => l.trim().length > 0).length, 0);
});

test('formatTable: empty headers returns empty string', () => {
  assert.equal(formatTable([], [['a']]), '');
});

// ---------------------------------------------------------------------------
// formatSummaryLine
// ---------------------------------------------------------------------------

test('formatSummaryLine: formats correctly with data', () => {
  const stats = makeStats();
  const line = formatSummaryLine(stats);
  assert.ok(line.includes('605'), 'combined savings (425+180)');
  assert.ok(line.includes('85.00%'), 'ratio');
  assert.ok(line.includes('2 redundancy hits'));
});

test('formatSummaryLine: singular "hit"', () => {
  const stats = makeStats({ totalRedundancyHits: 1 });
  const line = formatSummaryLine(stats);
  assert.ok(line.includes('1 redundancy hit'));
  assert.ok(!line.includes('hits'));
});

test('formatSummaryLine: zeros', () => {
  const line = formatSummaryLine(emptyStats());
  assert.ok(line.includes('0'));
  assert.ok(line.includes('0.00%'));
  assert.ok(line.includes('0 redundancy hits'));
});

// ---------------------------------------------------------------------------
// formatReport
// ---------------------------------------------------------------------------

test('formatReport: contains all required sections', () => {
  const stats = makeStats();
  const report = formatReport(stats);
  assert.ok(report.includes('# '), 'header');
  assert.ok(report.includes('## Session Summary'), 'session summary');
  assert.ok(report.includes('## Compression Stats'), 'compression stats');
  assert.ok(report.includes('## Redundancy Stats'), 'redundancy stats');
  assert.ok(report.includes('## Cumulative Savings'), 'cumulative savings');
  assert.ok(report.includes('## Per-Dimension Breakdown'), 'per-dimension');
  assert.ok(report.includes('## Active Codebook'), 'active codebook');
});

test('formatReport: custom name appears in header', () => {
  const report = formatReport(makeStats(), { name: 'My Custom Report' });
  assert.ok(report.startsWith('# My Custom Report'));
});

test('formatReport: custom description appears', () => {
  const report = formatReport(makeStats(), { description: 'Custom desc here.' });
  assert.ok(report.includes('Custom desc here.'));
});

test('formatReport: compression table includes event data', () => {
  const report = formatReport(makeStats());
  assert.ok(report.includes('500'), 'original tokens');
  assert.ok(report.includes('75'), 'compressed tokens');
  assert.ok(report.includes('425'), 'saved');
  assert.ok(report.includes('85.00%'), 'ratio');
});

test('formatReport: redundancy stats shows dimension frequency', () => {
  const report = formatReport(makeStats());
  assert.ok(report.includes('lang'));
  assert.ok(report.includes('err_style'));
});

test('formatReport: pricing shows cost estimate', () => {
  const report = formatReport(makeStats(), { pricing: { model: 'claude-3-5-sonnet', inputPer1k: 0.003 } });
  assert.ok(report.includes('claude-3-5-sonnet'));
  assert.ok(report.includes('$'));
});

test('formatReport: codebook displayed as key=value pairs', () => {
  const codebook = { lang: 'go', logging: 'slog' };
  const report = formatReport(makeStats(), { codebook });
  assert.ok(report.includes('lang=go'));
  assert.ok(report.includes('logging=slog'));
});

test('formatReport: empty stats shows placeholder messages', () => {
  const report = formatReport(emptyStats());
  assert.ok(report.includes('_No compression events recorded._'));
  assert.ok(report.includes('_No redundancy hits recorded._'));
  assert.ok(report.includes('_No dimension matches recorded._'));
  assert.ok(report.includes('_No codebook dimensions loaded._'));
});

test('formatReport: section dividers present', () => {
  const report = formatReport(makeStats());
  const count = (report.match(/---\n/g) ?? []).length;
  assert.ok(count >= 5, `expected ≥5 section dividers, got ${count}`);
});

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

test('CSV_HEADER: contains expected fields', () => {
  assert.ok(CSV_HEADER.includes('timestamp'));
  assert.ok(CSV_HEADER.includes('reportName'));
  assert.ok(CSV_HEADER.includes('totalOriginalTokens'));
  assert.ok(CSV_HEADER.includes('totalCompressedTokens'));
  assert.ok(CSV_HEADER.includes('totalSaved'));
  assert.ok(CSV_HEADER.includes('overallRatio'));
  assert.ok(CSV_HEADER.includes('redundancyHits'));
  assert.ok(CSV_HEADER.endsWith('\n'));
});

test('formatCsvRow: produces 7-field row', () => {
  const row = formatCsvRow(makeStats(), 'Test Session');
  // CSV with quoted name — count by splitting carefully
  // Fields: timestamp, "name", orig, comp, saved, ratio, hits
  // Use a simple split-count: there should be 6 commas outside quotes
  const fields = row.split(',');
  // The name field is quoted and may not contain commas so split is clean at 7
  assert.equal(fields.length, 7, `expected 7 fields, got: ${row}`);
});

test('formatCsvRow: timestamp is valid ISO', () => {
  const row = formatCsvRow(makeStats(), 'x');
  const ts = row.split(',')[0];
  assert.ok(!isNaN(Date.parse(ts)), `expected ISO timestamp, got: ${ts}`);
});

test('formatCsvRow: report name is quoted', () => {
  const row = formatCsvRow(makeStats(), 'My Session');
  assert.ok(row.includes('"My Session"'));
});

test('formatCsvRow: report name with quotes is escaped', () => {
  const row = formatCsvRow(makeStats(), 'Session "alpha"');
  assert.ok(row.includes('"Session ""alpha"""'));
});

test('formatCsvRow: numeric fields present', () => {
  const row = formatCsvRow(makeStats(), 'x');
  assert.ok(row.includes('500'));  // totalOriginalTokens
  assert.ok(row.includes('425'));  // totalSaved
  assert.ok(row.includes('0.85')); // overallRatio
  assert.ok(row.includes('2'));    // redundancyHits
});

test('appendToSavingsLog: creates file with header if not exists', () => {
  const dir = mkdtempSync(join(tmpdir(), 'egcc-test-'));
  const logPath = join(dir, 'savings.csv');
  const row = formatCsvRow(makeStats(), 'test');
  appendToSavingsLog(logPath, row);
  const content = readFileSync(logPath, 'utf8');
  assert.ok(content.startsWith('timestamp,reportName'));
  assert.ok(content.includes(row));
  rmSync(dir, { recursive: true });
});

test('appendToSavingsLog: appends without repeating header', () => {
  const dir = mkdtempSync(join(tmpdir(), 'egcc-test-'));
  const logPath = join(dir, 'savings.csv');
  const row1 = formatCsvRow(makeStats(), 'session-1');
  const row2 = formatCsvRow(makeStats(), 'session-2');
  appendToSavingsLog(logPath, row1);
  appendToSavingsLog(logPath, row2);
  const content = readFileSync(logPath, 'utf8');
  // Header should appear exactly once
  const headerCount = (content.match(/timestamp,reportName/g) ?? []).length;
  assert.equal(headerCount, 1);
  assert.ok(content.includes('session-1'));
  assert.ok(content.includes('session-2'));
  rmSync(dir, { recursive: true });
});
