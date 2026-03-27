/**
 * deriver.test.mjs — Tests for deriver and codebook modules.
 *
 * Run with: node --test tests/deriver.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

import { deriveDimensions, deriveFromFiles } from '../server/compression/deriver.mjs';
import {
  createCodebook,
  loadYamlOverrides,
  mergeCodebook,
  computeHash,
  loadCache,
  saveCache,
  isCacheValid,
} from '../server/compression/codebook.mjs';

// ---------------------------------------------------------------------------
// Helper: create a unique temp directory for each test that needs one
// ---------------------------------------------------------------------------
function tempDir() {
  return join(tmpdir(), `egcc-test-${randomBytes(8).toString('hex')}`);
}

// ---------------------------------------------------------------------------
// deriveDimensions — Go project (sample fixture)
// ---------------------------------------------------------------------------

test('deriveDimensions: extracts lang=go from Go project CLAUDE.md', async () => {
  const content = await readFile(new URL('./fixtures/sample-claude.md', import.meta.url), 'utf-8');
  const dims = deriveDimensions(content);
  assert.equal(dims.lang, 'go');
});

test('deriveDimensions: extracts testing dimension from Go project', async () => {
  const content = await readFile(new URL('./fixtures/sample-claude.md', import.meta.url), 'utf-8');
  const dims = deriveDimensions(content);
  assert.ok(dims.testing, 'Expected a testing dimension');
  assert.ok(dims.testing.includes('table_driven'), `Expected table_driven in testing, got: ${dims.testing}`);
  assert.ok(dims.testing.includes('testify'), `Expected testify in testing, got: ${dims.testing}`);
});

test('deriveDimensions: extracts err_style from Go project', async () => {
  const content = await readFile(new URL('./fixtures/sample-claude.md', import.meta.url), 'utf-8');
  const dims = deriveDimensions(content);
  assert.ok(dims.err_style, 'Expected an err_style dimension');
  assert.ok(dims.err_style.includes('wrap_errorf'), `Expected wrap_errorf in err_style, got: ${dims.err_style}`);
});

test('deriveDimensions: extracts logging from Go project', async () => {
  const content = await readFile(new URL('./fixtures/sample-claude.md', import.meta.url), 'utf-8');
  const dims = deriveDimensions(content);
  assert.ok(dims.logging, 'Expected a logging dimension');
  assert.ok(dims.logging.includes('slog'), `Expected slog in logging, got: ${dims.logging}`);
});

test('deriveDimensions: extracts arch=modular_monolith from Go project', async () => {
  const content = await readFile(new URL('./fixtures/sample-claude.md', import.meta.url), 'utf-8');
  const dims = deriveDimensions(content);
  assert.equal(dims.arch, 'modular_monolith');
});

test('deriveDimensions: extracts build=go_build from Go project', async () => {
  const content = await readFile(new URL('./fixtures/sample-claude.md', import.meta.url), 'utf-8');
  const dims = deriveDimensions(content);
  assert.ok(dims.build, 'Expected a build dimension');
  assert.ok(dims.build.includes('go_build'), `Expected go_build in build, got: ${dims.build}`);
});

test('deriveDimensions: extracts concurrency from Go project', async () => {
  const content = await readFile(new URL('./fixtures/sample-claude.md', import.meta.url), 'utf-8');
  const dims = deriveDimensions(content);
  assert.ok(dims.concurrency, 'Expected a concurrency dimension');
});

// ---------------------------------------------------------------------------
// deriveDimensions — empty/null input
// ---------------------------------------------------------------------------

test('deriveDimensions: empty string returns empty object', () => {
  assert.deepEqual(deriveDimensions(''), {});
});

test('deriveDimensions: null returns empty object', () => {
  assert.deepEqual(deriveDimensions(null), {});
});

test('deriveDimensions: undefined returns empty object', () => {
  assert.deepEqual(deriveDimensions(undefined), {});
});

test('deriveDimensions: whitespace-only returns empty object', () => {
  assert.deepEqual(deriveDimensions('   \n  \n  '), {});
});

// ---------------------------------------------------------------------------
// deriveDimensions — Python project
// ---------------------------------------------------------------------------

const PYTHON_CLAUDE_MD = `
# CLAUDE.md

## What This Is
A Python web application using Django for the backend and pytest for testing.

## Build & Run
\`\`\`bash
pip install -r requirements.txt
python manage.py runserver
\`\`\`

### Tests
\`\`\`bash
pytest tests/ -v
pytest --cov=app tests/
\`\`\`

## Code Conventions
- Use structured logging with the logging module.
- Handle errors with try/catch blocks where appropriate.
- Follow PEP 8 naming conventions.
- Use async/await for I/O-bound operations.
`;

test('deriveDimensions: extracts lang=python from Python project', () => {
  const dims = deriveDimensions(PYTHON_CLAUDE_MD);
  assert.equal(dims.lang, 'python');
});

test('deriveDimensions: extracts framework=django from Python project', () => {
  const dims = deriveDimensions(PYTHON_CLAUDE_MD);
  assert.equal(dims.framework, 'django');
});

test('deriveDimensions: extracts testing with pytest from Python project', () => {
  const dims = deriveDimensions(PYTHON_CLAUDE_MD);
  assert.ok(dims.testing, 'Expected testing dimension');
  assert.ok(dims.testing.includes('pytest'), `Expected pytest in testing, got: ${dims.testing}`);
});

// ---------------------------------------------------------------------------
// deriveDimensions — TypeScript/React project
// ---------------------------------------------------------------------------

const TS_REACT_CLAUDE_MD = `
# CLAUDE.md

## What This Is
A TypeScript React application with Next.js. Styled with Tailwind CSS.

## Build & Run
\`\`\`bash
npm run build
npm run dev
\`\`\`

### Tests
\`\`\`bash
npm run test
jest --coverage
\`\`\`

## Code Conventions
- Use TypeScript strict mode. tsconfig.json enforces noImplicitAny.
- Error handling via try/catch with custom error classes.
- Use winston for logging.
- Use barrel exports for clean module boundaries.
- All async operations use async/await pattern.
`;

test('deriveDimensions: extracts lang=typescript from TS/React project', () => {
  const dims = deriveDimensions(TS_REACT_CLAUDE_MD);
  assert.equal(dims.lang, 'typescript');
});

test('deriveDimensions: extracts framework=react from TS/React project', () => {
  const dims = deriveDimensions(TS_REACT_CLAUDE_MD);
  assert.ok(dims.framework, 'Expected framework dimension');
  assert.ok(dims.framework.includes('react'), `Expected react in framework, got: ${dims.framework}`);
});

test('deriveDimensions: extracts testing with jest from TS/React project', () => {
  const dims = deriveDimensions(TS_REACT_CLAUDE_MD);
  assert.ok(dims.testing, 'Expected testing dimension');
  assert.ok(dims.testing.includes('jest'), `Expected jest in testing, got: ${dims.testing}`);
});

test('deriveDimensions: extracts logging=winston from TS/React project', () => {
  const dims = deriveDimensions(TS_REACT_CLAUDE_MD);
  assert.equal(dims.logging, 'winston');
});

test('deriveDimensions: extracts err_style with try_catch from TS/React project', () => {
  const dims = deriveDimensions(TS_REACT_CLAUDE_MD);
  assert.ok(dims.err_style, 'Expected err_style dimension');
  assert.ok(dims.err_style.includes('try_catch'), `Expected try_catch in err_style, got: ${dims.err_style}`);
});

test('deriveDimensions: extracts barrel_exports from TS/React project', () => {
  const dims = deriveDimensions(TS_REACT_CLAUDE_MD);
  assert.ok(dims.pkg_style, 'Expected pkg_style dimension');
  assert.ok(dims.pkg_style.includes('barrel_exports'), `Expected barrel_exports in pkg_style, got: ${dims.pkg_style}`);
});

test('deriveDimensions: extracts concurrency with async_await from TS/React project', () => {
  const dims = deriveDimensions(TS_REACT_CLAUDE_MD);
  assert.ok(dims.concurrency, 'Expected concurrency dimension');
  assert.ok(dims.concurrency.includes('async_await'), `Expected async_await in concurrency, got: ${dims.concurrency}`);
});

// ---------------------------------------------------------------------------
// deriveDimensions — transport detection
// ---------------------------------------------------------------------------

test('deriveDimensions: detects QUIC and WebSocket transports', () => {
  const content = `
# Project

## Architecture
Uses QUIC for client connections and WebSocket for browser fallback.
gRPC is used for inter-service communication.
`;
  const dims = deriveDimensions(content);
  assert.ok(dims.transport, 'Expected transport dimension');
  assert.ok(dims.transport.includes('quic'), `Expected quic in transport, got: ${dims.transport}`);
  assert.ok(dims.transport.includes('websocket'), `Expected websocket in transport, got: ${dims.transport}`);
  assert.ok(dims.transport.includes('grpc'), `Expected grpc in transport, got: ${dims.transport}`);
});

// ---------------------------------------------------------------------------
// deriveFromFiles
// ---------------------------------------------------------------------------

test('deriveFromFiles: reads file from disk and derives dimensions', async () => {
  const fixturePath = new URL('./fixtures/sample-claude.md', import.meta.url).pathname;
  const dims = await deriveFromFiles([fixturePath]);
  assert.equal(dims.lang, 'go');
  assert.ok(dims.arch);
});

test('deriveFromFiles: empty array returns empty object', async () => {
  const dims = await deriveFromFiles([]);
  assert.deepEqual(dims, {});
});

test('deriveFromFiles: null returns empty object', async () => {
  const dims = await deriveFromFiles(null);
  assert.deepEqual(dims, {});
});

test('deriveFromFiles: nonexistent file is skipped gracefully', async () => {
  const dims = await deriveFromFiles(['/nonexistent/path/CLAUDE.md']);
  assert.deepEqual(dims, {});
});

test('deriveFromFiles: skips missing files and processes existing ones', async () => {
  const fixturePath = new URL('./fixtures/sample-claude.md', import.meta.url).pathname;
  const dims = await deriveFromFiles(['/nonexistent/path/CLAUDE.md', fixturePath]);
  assert.equal(dims.lang, 'go');
});

// ---------------------------------------------------------------------------
// createCodebook
// ---------------------------------------------------------------------------

test('createCodebook: wraps dimensions with hash and timestamp', () => {
  const dims = { lang: 'go', arch: 'modular_monolith' };
  const cb = createCodebook(dims);
  assert.deepEqual(cb.dimensions, dims);
  assert.ok(typeof cb.hash === 'string' && cb.hash.length === 64, 'hash should be 64-char hex');
  assert.ok(typeof cb.timestamp === 'string', 'timestamp should be a string');
  assert.ok(!isNaN(Date.parse(cb.timestamp)), 'timestamp should be a valid ISO date');
});

test('createCodebook: null input produces empty dimensions', () => {
  const cb = createCodebook(null);
  assert.deepEqual(cb.dimensions, {});
});

test('createCodebook: empty object produces empty dimensions', () => {
  const cb = createCodebook({});
  assert.deepEqual(cb.dimensions, {});
});

test('createCodebook: does not mutate input dimensions', () => {
  const dims = { lang: 'go' };
  const cb = createCodebook(dims);
  cb.dimensions.lang = 'python';
  assert.equal(dims.lang, 'go', 'original should not be mutated');
});

// ---------------------------------------------------------------------------
// computeHash
// ---------------------------------------------------------------------------

test('computeHash: returns 64-char hex string', () => {
  const hash = computeHash('hello world');
  assert.equal(hash.length, 64);
  assert.ok(/^[0-9a-f]{64}$/.test(hash), `Expected hex string, got: ${hash}`);
});

test('computeHash: deterministic for same input', () => {
  const a = computeHash('test content');
  const b = computeHash('test content');
  assert.equal(a, b);
});

test('computeHash: different input produces different hash', () => {
  const a = computeHash('content A');
  const b = computeHash('content B');
  assert.notEqual(a, b);
});

test('computeHash: handles null', () => {
  const hash = computeHash(null);
  assert.equal(hash.length, 64);
});

test('computeHash: handles empty string', () => {
  const hash = computeHash('');
  assert.equal(hash.length, 64);
});

// ---------------------------------------------------------------------------
// loadYamlOverrides
// ---------------------------------------------------------------------------

test('loadYamlOverrides: loads sample-codebook.yaml fixture', async () => {
  const fixturePath = new URL('./fixtures/sample-codebook.yaml', import.meta.url).pathname;
  const overrides = await loadYamlOverrides(fixturePath);
  assert.ok(overrides, 'Should return parsed object');
  assert.ok(overrides.dimensions, 'Should have dimensions key');
  assert.equal(overrides.dimensions.lang.value, 'go');
  assert.equal(overrides.dimensions.session_state.value, 'ephemeral');
  assert.equal(overrides.dimensions.custom_rule.value, 'no_interpreter_prompts');
});

test('loadYamlOverrides: returns null for nonexistent file', async () => {
  const result = await loadYamlOverrides('/nonexistent/file.yaml');
  assert.equal(result, null);
});

test('loadYamlOverrides: returns null dimension with value: null', async () => {
  const fixturePath = new URL('./fixtures/sample-codebook.yaml', import.meta.url).pathname;
  const overrides = await loadYamlOverrides(fixturePath);
  assert.equal(overrides.dimensions.framework.value, null);
});

// ---------------------------------------------------------------------------
// mergeCodebook
// ---------------------------------------------------------------------------

test('mergeCodebook: YAML overrides auto-derived for matching keys', () => {
  const derived = { lang: 'go', arch: 'monolith' };
  const overrides = { dimensions: { arch: { type: 'enum', value: 'modular_monolith' } } };
  const merged = mergeCodebook(derived, overrides);
  assert.equal(merged.lang, 'go');
  assert.equal(merged.arch, 'modular_monolith');
});

test('mergeCodebook: YAML adds new dimensions', () => {
  const derived = { lang: 'go' };
  const overrides = { dimensions: { session_state: { type: 'enum', value: 'ephemeral' } } };
  const merged = mergeCodebook(derived, overrides);
  assert.equal(merged.lang, 'go');
  assert.equal(merged.session_state, 'ephemeral');
});

test('mergeCodebook: YAML suppresses with value: null', () => {
  const derived = { lang: 'go', framework: 'none', arch: 'modular_monolith' };
  const overrides = { dimensions: { framework: { type: 'enum', value: null } } };
  const merged = mergeCodebook(derived, overrides);
  assert.equal(merged.lang, 'go');
  assert.equal(merged.arch, 'modular_monolith');
  assert.ok(!('framework' in merged), 'framework should be suppressed');
});

test('mergeCodebook: null overrides returns derived unchanged', () => {
  const derived = { lang: 'go', arch: 'modular_monolith' };
  const merged = mergeCodebook(derived, null);
  assert.deepEqual(merged, { lang: 'go', arch: 'modular_monolith' });
});

test('mergeCodebook: does not mutate inputs', () => {
  const derived = { lang: 'go' };
  const overrides = { dimensions: { lang: { type: 'enum', value: 'python' } } };
  mergeCodebook(derived, overrides);
  assert.equal(derived.lang, 'go', 'original derived should not be mutated');
});

test('mergeCodebook: combined override, add, and suppress', () => {
  const derived = { lang: 'go', framework: 'gin', arch: 'monolith' };
  const overrides = {
    dimensions: {
      lang: { type: 'enum', value: 'go' },                 // same
      framework: { type: 'enum', value: null },             // suppress
      arch: { type: 'enum', value: 'modular_monolith' },    // override
      custom: { type: 'freeform', value: 'special_rule' },  // add
    },
  };
  const merged = mergeCodebook(derived, overrides);
  assert.equal(merged.lang, 'go');
  assert.ok(!('framework' in merged), 'framework should be suppressed');
  assert.equal(merged.arch, 'modular_monolith');
  assert.equal(merged.custom, 'special_rule');
});

// ---------------------------------------------------------------------------
// Cache: saveCache, loadCache, isCacheValid
// ---------------------------------------------------------------------------

test('saveCache/loadCache: round-trip persists and restores codebook', async () => {
  const dir = tempDir();
  const cachePath = join(dir, '.engram', 'codebook-cache.json');
  const codebook = createCodebook({ lang: 'go', arch: 'modular_monolith' });
  const contentHash = computeHash('some content');

  await saveCache(cachePath, codebook, contentHash);
  const loaded = await loadCache(cachePath);

  assert.ok(loaded, 'Should load cache');
  assert.equal(loaded.contentHash, contentHash);
  assert.deepEqual(loaded.codebook.dimensions, codebook.dimensions);
  assert.equal(loaded.codebook.hash, codebook.hash);

  // Cleanup
  await rm(dir, { recursive: true, force: true });
});

test('loadCache: returns null for nonexistent file', async () => {
  const result = await loadCache('/nonexistent/path/cache.json');
  assert.equal(result, null);
});

test('loadCache: returns null for invalid JSON', async () => {
  const dir = tempDir();
  const cachePath = join(dir, 'bad.json');
  await mkdir(dir, { recursive: true });
  await writeFile(cachePath, 'not valid json!!!', 'utf-8');

  const result = await loadCache(cachePath);
  assert.equal(result, null);

  await rm(dir, { recursive: true, force: true });
});

test('loadCache: returns null for JSON without contentHash', async () => {
  const dir = tempDir();
  const cachePath = join(dir, 'no-hash.json');
  await mkdir(dir, { recursive: true });
  await writeFile(cachePath, '{"codebook": {}}', 'utf-8');

  const result = await loadCache(cachePath);
  assert.equal(result, null);

  await rm(dir, { recursive: true, force: true });
});

test('isCacheValid: returns true when hashes match', () => {
  const hash = computeHash('content');
  const cache = { contentHash: hash };
  assert.equal(isCacheValid(cache, hash), true);
});

test('isCacheValid: returns false when hashes differ', () => {
  const cache = { contentHash: computeHash('old content') };
  assert.equal(isCacheValid(cache, computeHash('new content')), false);
});

test('isCacheValid: returns false for null cache', () => {
  assert.equal(isCacheValid(null, 'somehash'), false);
});

test('isCacheValid: returns false when cache has no contentHash', () => {
  assert.equal(isCacheValid({}, 'somehash'), false);
});

test('isCacheValid: returns false when currentContentHash is empty', () => {
  assert.equal(isCacheValid({ contentHash: 'abc' }, ''), false);
});

// ---------------------------------------------------------------------------
// Integration: derive -> codebook -> merge -> serialize round-trip
// ---------------------------------------------------------------------------

test('integration: derive + codebook + merge produces coherent result', async () => {
  const content = await readFile(new URL('./fixtures/sample-claude.md', import.meta.url), 'utf-8');
  const derived = deriveDimensions(content);
  const codebook = createCodebook(derived);
  const overrides = await loadYamlOverrides(
    new URL('./fixtures/sample-codebook.yaml', import.meta.url).pathname
  );
  const merged = mergeCodebook(derived, overrides);

  // lang should be preserved (both derived and override say 'go')
  assert.equal(merged.lang, 'go');
  // session_state should be added from overrides
  assert.equal(merged.session_state, 'ephemeral');
  // custom_rule should be added from overrides
  assert.equal(merged.custom_rule, 'no_interpreter_prompts');
  // framework should be suppressed (value: null in overrides)
  assert.ok(!('framework' in merged), 'framework should be suppressed by override');
  // db_layer added from overrides
  assert.equal(merged.db_layer, 'sqlx');
  // codebook should have valid hash
  assert.equal(codebook.hash.length, 64);
});
