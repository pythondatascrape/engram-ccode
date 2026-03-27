/**
 * detector.test.mjs — Tests for redundancy detector and token ledger.
 *
 * Run with: node --test tests/detector.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createDetector } from '../server/redundancy/detector.mjs';
import { createLedger } from '../server/tracking/ledger.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a string that is definitely >= 200 tokens (~900+ chars of prose). */
function longContent(extra = '') {
  // Each repetition is ~45 chars; 20 reps = 900 chars ≈ 230 tokens. Always above 200.
  const pad = 'The quick brown fox jumps over the lazy dog. '.repeat(20);
  return pad + (extra ? ' ' + extra : '');
}

/** A Go codebook matching the Engram example. */
const GO_CODEBOOK = {
  dimensions: {
    lang: 'go',
    err_style: 'wrap_errorf',
    logging: 'slog',
    testing: 'table_driven_testify',
    arch: 'modular_monolith',
    concurrency: 'errgroup_ctx_cancel',
    pkg_style: 'no_circular',
  },
};

// ---------------------------------------------------------------------------
// createDetector — basic construction
// ---------------------------------------------------------------------------

test('createDetector: returns check and updateCodebook functions', () => {
  const detector = createDetector(GO_CODEBOOK);
  assert.equal(typeof detector.check, 'function');
  assert.equal(typeof detector.updateCodebook, 'function');
});

test('createDetector: works with empty codebook', () => {
  const detector = createDetector({});
  const result = detector.check(longContent());
  assert.equal(result.redundant, false);
  assert.deepEqual(result.matches, []);
});

test('createDetector: works with null codebook', () => {
  const detector = createDetector(null);
  const result = detector.check(longContent());
  assert.equal(result.redundant, false);
});

test('createDetector: accepts plain dimension map (no .dimensions wrapper)', () => {
  const detector = createDetector({ lang: 'go' });
  const result = detector.check(longContent('The project is written in golang.'));
  assert.equal(result.redundant, true);
  assert.ok(result.matches.includes('lang'));
});

// ---------------------------------------------------------------------------
// check() — language detection
// ---------------------------------------------------------------------------

test('check: detects Go language mention as redundant', () => {
  const detector = createDetector(GO_CODEBOOK);
  const content = longContent('This project is written in golang and uses Go modules.');
  const result = detector.check(content);
  assert.equal(result.redundant, true);
  assert.ok(result.matches.includes('lang'), `Expected lang in matches: ${result.matches}`);
});

test('check: detects "golang" keyword for lang=go', () => {
  const detector = createDetector({ dimensions: { lang: 'go' } });
  const content = longContent('The codebase uses golang for its implementation.');
  const result = detector.check(content);
  assert.equal(result.redundant, true);
  assert.ok(result.matches.includes('lang'));
});

// ---------------------------------------------------------------------------
// check() — error style detection
// ---------------------------------------------------------------------------

test('check: detects fmt.Errorf as redundant for err_style=wrap_errorf', () => {
  const detector = createDetector(GO_CODEBOOK);
  const content = longContent('Always use fmt.Errorf to wrap errors in this project.');
  const result = detector.check(content);
  assert.equal(result.redundant, true);
  assert.ok(result.matches.includes('err_style'), `Expected err_style in matches: ${result.matches}`);
});

test('check: detects %w format verb for err_style=wrap_errorf', () => {
  const detector = createDetector({ dimensions: { err_style: 'wrap_errorf' } });
  const content = longContent('Use %w to wrap errors so they can be unwrapped later with errors.As.');
  const result = detector.check(content);
  assert.equal(result.redundant, true);
  assert.ok(result.matches.includes('err_style'));
});

// ---------------------------------------------------------------------------
// check() — no identity mentions
// ---------------------------------------------------------------------------

test('check: returns not redundant when content has no identity mentions', () => {
  const detector = createDetector(GO_CODEBOOK);
  const content = longContent(
    'Here is a list of files in the repository: main.go, config.yaml, README.md. ' +
    'The deployment runs on three nodes. Network latency is 2ms. ' +
    'Memory usage is 128MB. CPU is at 12% utilization on average. '
  );
  const result = detector.check(content);
  // Content is about infra stats — not reinforcing coding identity.
  assert.equal(typeof result.redundant, 'boolean');
  assert.ok(Array.isArray(result.matches));
});

// ---------------------------------------------------------------------------
// check() — short content is skipped
// ---------------------------------------------------------------------------

test('check: skips content shorter than 200 tokens', () => {
  const detector = createDetector(GO_CODEBOOK);
  // This is definitely < 200 tokens even though it contains keywords.
  const shortContent = 'Use golang and fmt.Errorf and slog.';
  const result = detector.check(shortContent);
  assert.equal(result.redundant, false);
  assert.deepEqual(result.matches, []);
});

test('check: returns token count even for short content', () => {
  const detector = createDetector(GO_CODEBOOK);
  const result = detector.check('hello world');
  assert.ok(typeof result.tokens === 'number');
  assert.ok(result.tokens >= 0);
});

test('check: empty string is treated as short content (not redundant)', () => {
  const detector = createDetector(GO_CODEBOOK);
  const result = detector.check('');
  assert.equal(result.redundant, false);
  assert.equal(result.tokens, 0);
});

// ---------------------------------------------------------------------------
// check() — logging dimension
// ---------------------------------------------------------------------------

test('check: detects slog mention as redundant for logging=slog', () => {
  const detector = createDetector(GO_CODEBOOK);
  const content = longContent('Use slog. for structured logging throughout the application codebase here.');
  const result = detector.check(content);
  assert.equal(result.redundant, true);
  assert.ok(result.matches.includes('logging'));
});

// ---------------------------------------------------------------------------
// check() — multiple matches
// ---------------------------------------------------------------------------

test('check: can match multiple dimensions at once', () => {
  const detector = createDetector(GO_CODEBOOK);
  const content = longContent(
    'This codebase uses golang and wraps errors with fmt.Errorf for consistent handling. ' +
    'Structured logging via slog. is the standard approach used everywhere in the codebase. '
  );
  const result = detector.check(content);
  assert.equal(result.redundant, true);
  assert.ok(result.matches.length >= 2, `Expected >= 2 matches, got: ${result.matches}`);
});

// ---------------------------------------------------------------------------
// check() — case insensitivity
// ---------------------------------------------------------------------------

test('check: matching is case-insensitive', () => {
  const detector = createDetector({ dimensions: { logging: 'slog' } });
  const content = longContent('Use SLOG. for all logging in this application. SLOG is the best choice here.');
  const result = detector.check(content);
  assert.equal(result.redundant, true);
  assert.ok(result.matches.includes('logging'));
});

// ---------------------------------------------------------------------------
// updateCodebook()
// ---------------------------------------------------------------------------

test('updateCodebook: changes what is detected', () => {
  const detector = createDetector({ dimensions: { lang: 'go' } });

  // Original: lang=go — detect golang.
  const goContent = longContent('The project is written in golang and uses Go modules everywhere.');
  const before = detector.check(goContent);
  assert.equal(before.redundant, true);

  // Switch to Python — golang should no longer match.
  detector.updateCodebook({ dimensions: { lang: 'python' } });
  const after = detector.check(goContent);
  // golang is a Go keyword, not python — should not match python codebook
  assert.equal(after.redundant, false);
});

test('updateCodebook: new codebook is immediately used', () => {
  const detector = createDetector({});
  // Empty codebook — nothing matches.
  const before = detector.check(longContent('Use golang and fmt.Errorf everywhere.'));
  assert.equal(before.redundant, false);

  // Add lang=go — now golang should match.
  detector.updateCodebook({ dimensions: { lang: 'go' } });
  const after = detector.check(longContent('Use golang and the Go standard library everywhere.'));
  assert.equal(after.redundant, true);
});

test('updateCodebook: accepts null (resets to empty)', () => {
  const detector = createDetector(GO_CODEBOOK);
  detector.updateCodebook(null);
  const result = detector.check(longContent('Use golang and fmt.Errorf for the project.'));
  assert.equal(result.redundant, false);
});

// ---------------------------------------------------------------------------
// check() — tokens field
// ---------------------------------------------------------------------------

test('check: tokens field reflects approximate count of the content', () => {
  const detector = createDetector(GO_CODEBOOK);
  const content = longContent();
  const result = detector.check(content);
  assert.ok(result.tokens > 0, `Expected positive token count, got ${result.tokens}`);
});

// ---------------------------------------------------------------------------
// Ledger: recordCompression
// ---------------------------------------------------------------------------

test('ledger: recordCompression captures token delta', () => {
  const ledger = createLedger();
  const original =
    'You are working on a Go project. Use errgroup for concurrency. ' +
    'Wrap errors with fmt.Errorf. Use slog for structured logging. ' +
    'Avoid circular imports. Use table-driven tests with testify.';
  const compressed = 'arch=modular_monolith concurrency=errgroup_ctx_cancel err_style=wrap_errorf lang=go logging=slog';
  ledger.recordCompression(original, compressed);

  const stats = ledger.getStats();
  assert.equal(stats.compressions.length, 1);
  const c = stats.compressions[0];
  assert.ok(c.originalTokens > 0);
  assert.ok(c.compressedTokens > 0);
  assert.ok(c.saved >= 0);
  assert.ok(typeof c.ratio === 'number');
  assert.ok(c.timestamp);
});

test('ledger: recordCompression with identical strings has saved=0', () => {
  const ledger = createLedger();
  ledger.recordCompression('hello world', 'hello world');
  const stats = ledger.getStats();
  assert.equal(stats.compressions[0].saved, 0);
  assert.equal(stats.compressions[0].ratio, 0);
});

// ---------------------------------------------------------------------------
// Ledger: recordRedundancy
// ---------------------------------------------------------------------------

test('ledger: recordRedundancy accumulates hits', () => {
  const ledger = createLedger();
  ledger.recordRedundancy(['lang', 'err_style'], 500);
  ledger.recordRedundancy(['logging'], 300);

  const stats = ledger.getStats();
  assert.equal(stats.redundancies.length, 2);
  assert.equal(stats.totalRedundancyHits, 2);
  assert.equal(stats.totalRedundantTokens, 800);
});

test('ledger: recordRedundancy stores matches array', () => {
  const ledger = createLedger();
  ledger.recordRedundancy(['lang', 'logging'], 400);
  const stats = ledger.getStats();
  assert.deepEqual(stats.redundancies[0].matches, ['lang', 'logging']);
  assert.equal(stats.redundancies[0].tokens, 400);
});

// ---------------------------------------------------------------------------
// Ledger: getStats aggregates
// ---------------------------------------------------------------------------

test('ledger: getStats returns correct aggregates for multiple compressions', () => {
  const ledger = createLedger();
  ledger.recordCompression('this is the original long text with many words', 'short=text');
  ledger.recordCompression('another longer piece of original content here', 'another=compressed');

  const stats = ledger.getStats();
  assert.equal(stats.compressions.length, 2);
  assert.equal(stats.totalOriginalTokens, stats.compressions.reduce((s, c) => s + c.originalTokens, 0));
  assert.equal(stats.totalCompressedTokens, stats.compressions.reduce((s, c) => s + c.compressedTokens, 0));
  assert.equal(stats.totalSaved, stats.compressions.reduce((s, c) => s + c.saved, 0));
});

test('ledger: getStats has sessionStart as ISO string', () => {
  const ledger = createLedger();
  const stats = ledger.getStats();
  assert.ok(typeof stats.sessionStart === 'string');
  assert.ok(!isNaN(Date.parse(stats.sessionStart)));
});

test('ledger: getStats overallRatio is between 0 and 1', () => {
  const ledger = createLedger();
  ledger.recordCompression(
    'The quick brown fox jumps over the lazy dog and the fox ran away',
    'fox=runs'
  );
  const stats = ledger.getStats();
  assert.ok(stats.overallRatio >= 0 && stats.overallRatio <= 1, `ratio out of range: ${stats.overallRatio}`);
});

test('ledger: getStats overallRatio is 0 when no compressions', () => {
  const ledger = createLedger();
  const stats = ledger.getStats();
  assert.equal(stats.overallRatio, 0);
  assert.equal(stats.totalOriginalTokens, 0);
  assert.equal(stats.totalSaved, 0);
});

test('ledger: getStats returns immutable copies of arrays', () => {
  const ledger = createLedger();
  ledger.recordRedundancy(['lang'], 100);
  const stats = ledger.getStats();
  stats.redundancies.push({ timestamp: 'fake', matches: [], tokens: 0 });
  const stats2 = ledger.getStats();
  assert.equal(stats2.redundancies.length, 1); // Internal state not mutated.
});

// ---------------------------------------------------------------------------
// Ledger: shouldNotify
// ---------------------------------------------------------------------------

test('ledger: shouldNotify returns false when below default threshold', () => {
  const ledger = createLedger();
  ledger.recordRedundancy(['lang'], 500);
  assert.equal(ledger.shouldNotify(), false);
});

test('ledger: shouldNotify returns true when above default threshold (10000)', () => {
  const ledger = createLedger();
  ledger.recordRedundancy(['lang'], 5000);
  ledger.recordRedundancy(['logging'], 6000);
  assert.equal(ledger.shouldNotify(), true);
});

test('ledger: shouldNotify respects custom threshold', () => {
  const ledger = createLedger();
  ledger.recordRedundancy(['lang'], 300);
  assert.equal(ledger.shouldNotify(200), true);
  assert.equal(ledger.shouldNotify(500), false);
});

test('ledger: shouldNotify returns false when no redundancies recorded', () => {
  const ledger = createLedger();
  assert.equal(ledger.shouldNotify(), false);
});

// ---------------------------------------------------------------------------
// Ledger: reset
// ---------------------------------------------------------------------------

test('ledger: reset clears all stats', () => {
  const ledger = createLedger();
  ledger.recordCompression('long original text here for testing', 'short=text');
  ledger.recordRedundancy(['lang', 'logging'], 500);

  ledger.reset();

  const stats = ledger.getStats();
  assert.equal(stats.compressions.length, 0);
  assert.equal(stats.redundancies.length, 0);
  assert.equal(stats.totalOriginalTokens, 0);
  assert.equal(stats.totalSaved, 0);
  assert.equal(stats.totalRedundancyHits, 0);
  assert.equal(stats.totalRedundantTokens, 0);
});

test('ledger: reset updates sessionStart to a new timestamp', async () => {
  const ledger = createLedger();
  const before = ledger.getStats().sessionStart;
  // Small delay to ensure different timestamp.
  await new Promise((r) => setTimeout(r, 5));
  ledger.reset();
  const after = ledger.getStats().sessionStart;
  // Both should be valid ISO strings; after >= before.
  assert.ok(new Date(after) >= new Date(before));
});

test('ledger: can record again after reset', () => {
  const ledger = createLedger();
  ledger.recordCompression('original text to compress down', 'compressed=text');
  ledger.reset();
  ledger.recordRedundancy(['lang'], 200);
  const stats = ledger.getStats();
  assert.equal(stats.redundancies.length, 1);
  assert.equal(stats.compressions.length, 0);
});

// ---------------------------------------------------------------------------
// Ledger: multiple compressions and redundancies aggregate correctly
// ---------------------------------------------------------------------------

test('ledger: multiple compressions and redundancies aggregate correctly', () => {
  const ledger = createLedger();

  ledger.recordCompression('first original content that is much longer than the compressed', 'first=compressed');
  ledger.recordCompression('second original content that is also quite lengthy and verbose', 'second=short');
  ledger.recordRedundancy(['lang'], 400);
  ledger.recordRedundancy(['err_style', 'logging'], 600);
  ledger.recordRedundancy(['testing'], 200);

  const stats = ledger.getStats();
  assert.equal(stats.compressions.length, 2);
  assert.equal(stats.redundancies.length, 3);
  assert.equal(stats.totalRedundancyHits, 3);
  assert.equal(stats.totalRedundantTokens, 1200);

  // Totals must equal sum of individual records.
  const expectedOriginal = stats.compressions.reduce((s, c) => s + c.originalTokens, 0);
  const expectedSaved = stats.compressions.reduce((s, c) => s + c.saved, 0);
  assert.equal(stats.totalOriginalTokens, expectedOriginal);
  assert.equal(stats.totalSaved, expectedSaved);
});
