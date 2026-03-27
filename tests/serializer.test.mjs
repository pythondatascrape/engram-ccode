/**
 * serializer.test.mjs — Tests for serializer and tokenizer modules.
 *
 * Run with: node --test tests/serializer.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { serialize, deserialize, formatBlock } from '../server/compression/serializer.mjs';
import { countTokens, tokenDelta } from '../server/tracking/tokenizer.mjs';

// ---------------------------------------------------------------------------
// serialize()
// ---------------------------------------------------------------------------

test('serialize: basic multi-dimension object', () => {
  const result = serialize({ lang: 'go', err_style: 'wrap_errorf', logging: 'slog' });
  assert.equal(result, 'err_style=wrap_errorf lang=go logging=slog');
});

test('serialize: alphabetical sort is deterministic regardless of input order', () => {
  const a = serialize({ z: 'last', a: 'first', m: 'middle' });
  const b = serialize({ m: 'middle', z: 'last', a: 'first' });
  assert.equal(a, b);
  assert.equal(a, 'a=first m=middle z=last');
});

test('serialize: values with spaces are converted to underscores', () => {
  const result = serialize({ arch: 'modular monolith', style: 'table driven' });
  assert.equal(result, 'arch=modular_monolith style=table_driven');
});

test('serialize: keys and values are lowercased', () => {
  assert.equal(serialize({ Lang: 'Go', Logging: 'Slog' }), 'lang=go logging=slog');
  assert.equal(serialize({ LANG: 'GO' }), 'lang=go');
  assert.equal(serialize({ TESTING: 'TABLE_DRIVEN' }), 'testing=table_driven');
  assert.equal(serialize({ LANG: 'Go', ERR_STYLE: 'WrapErrorf' }), 'err_style=wraperrorf lang=go');
});

test('serialize: null values are omitted', () => {
  const result = serialize({ lang: 'go', missing: null, logging: 'slog' });
  assert.equal(result, 'lang=go logging=slog');
});

test('serialize: undefined values are omitted', () => {
  const result = serialize({ lang: 'go', missing: undefined, logging: 'slog' });
  assert.equal(result, 'lang=go logging=slog');
});

test('serialize: empty string values are omitted', () => {
  const result = serialize({ lang: 'go', empty: '', logging: 'slog' });
  assert.equal(result, 'lang=go logging=slog');
});

test('serialize: empty object produces empty string', () => {
  assert.equal(serialize({}), '');
});

test('serialize: null input produces empty string', () => {
  assert.equal(serialize(null), '');
});

test('serialize: undefined input produces empty string', () => {
  assert.equal(serialize(undefined), '');
});

test('serialize: accepts a Map', () => {
  const m = new Map([['lang', 'go'], ['logging', 'slog']]);
  const result = serialize(m);
  assert.equal(result, 'lang=go logging=slog');
});

test('serialize: single dimension', () => {
  assert.equal(serialize({ lang: 'go' }), 'lang=go');
});

test('serialize: full Engram example', () => {
  const dims = {
    arch: 'modular_monolith',
    concurrency: 'errgroup_ctx_cancel',
    err_style: 'wrap_errorf',
    lang: 'go',
    logging: 'slog',
    pkg_style: 'no_circular',
    testing: 'table_driven_testify',
  };
  const result = serialize(dims);
  assert.equal(
    result,
    'arch=modular_monolith concurrency=errgroup_ctx_cancel err_style=wrap_errorf lang=go logging=slog pkg_style=no_circular testing=table_driven_testify'
  );
});

test('serialize: very long values are preserved', () => {
  const longVal = 'a'.repeat(200);
  const result = serialize({ key: longVal });
  assert.equal(result, `key=${'a'.repeat(200)}`);
});

// ---------------------------------------------------------------------------
// deserialize()
// ---------------------------------------------------------------------------

test('deserialize: round-trips a serialized string', () => {
  const original = { lang: 'go', err_style: 'wrap_errorf', logging: 'slog' };
  const serialized = serialize(original);
  const restored = deserialize(serialized);
  assert.deepEqual(restored, original);
});

test('deserialize: empty string returns empty object', () => {
  assert.deepEqual(deserialize(''), {});
});

test('deserialize: null input returns empty object', () => {
  assert.deepEqual(deserialize(null), {});
});

test('deserialize: undefined input returns empty object', () => {
  assert.deepEqual(deserialize(undefined), {});
});

test('deserialize: malformed tokens (no equals) are skipped', () => {
  const result = deserialize('lang=go BADTOKEN logging=slog');
  assert.deepEqual(result, { lang: 'go', logging: 'slog' });
});

test('deserialize: completely malformed input returns empty object', () => {
  assert.deepEqual(deserialize('notakeyvalue noequalssign'), {});
});

test('deserialize: handles values containing underscores', () => {
  const result = deserialize('arch=modular_monolith');
  assert.deepEqual(result, { arch: 'modular_monolith' });
});

test('deserialize: handles values that themselves contain =', () => {
  // Only the first '=' is the separator; rest is value.
  const result = deserialize('expr=a=b');
  assert.deepEqual(result, { expr: 'a=b' });
});

// ---------------------------------------------------------------------------
// formatBlock()
// ---------------------------------------------------------------------------

test('formatBlock: wraps serialized string in identity tags', () => {
  const serialized = 'lang=go logging=slog';
  const block = formatBlock(serialized);
  assert.equal(block, '[identity]\nlang=go logging=slog\n[/identity]');
});

test('formatBlock: works with empty string', () => {
  const block = formatBlock('');
  assert.equal(block, '[identity]\n\n[/identity]');
});

test('formatBlock: works with null', () => {
  const block = formatBlock(null);
  assert.equal(block, '[identity]\n\n[/identity]');
});

test('formatBlock: full round-trip produces correct block', () => {
  const dims = { lang: 'go', logging: 'slog', err_style: 'wrap_errorf' };
  const block = formatBlock(serialize(dims));
  assert.equal(block, '[identity]\nerr_style=wrap_errorf lang=go logging=slog\n[/identity]');
});

// ---------------------------------------------------------------------------
// countTokens()
// ---------------------------------------------------------------------------

test('countTokens: returns 0 for empty string', () => {
  assert.equal(countTokens(''), 0);
});

test('countTokens: returns 0 for null', () => {
  assert.equal(countTokens(null), 0);
});

test('countTokens: returns 0 for undefined', () => {
  assert.equal(countTokens(undefined), 0);
});

test('countTokens: returns 0 for whitespace-only string', () => {
  assert.equal(countTokens('   '), 0);
});

test('countTokens: returns a positive number for normal text', () => {
  const count = countTokens('The quick brown fox jumps over the lazy dog');
  assert.ok(count > 0, `Expected positive token count, got ${count}`);
});

test('countTokens: longer text has more tokens than shorter text', () => {
  const short = countTokens('hello world');
  const long = countTokens('hello world foo bar baz qux quux corge grault garply waldo fred plugh thud');
  assert.ok(long > short, `Expected long(${long}) > short(${short})`);
});

test('countTokens: returns a number (not NaN)', () => {
  const result = countTokens('some text here');
  assert.ok(typeof result === 'number' && !isNaN(result));
});

test('countTokens: single word returns at least 1', () => {
  assert.ok(countTokens('hello') >= 1);
});

// ---------------------------------------------------------------------------
// tokenDelta()
// ---------------------------------------------------------------------------

test('tokenDelta: returns correct shape', () => {
  const delta = tokenDelta('some longer text here', 'short');
  assert.ok(typeof delta.original === 'number');
  assert.ok(typeof delta.compressed === 'number');
  assert.ok(typeof delta.saved === 'number');
  assert.ok(typeof delta.ratio === 'number');
});

test('tokenDelta: saved = original - compressed when original > compressed', () => {
  const original = 'The quick brown fox jumps over the lazy dog and runs away fast';
  const compressed = 'fox runs';
  const delta = tokenDelta(original, compressed);
  assert.equal(delta.saved, delta.original - delta.compressed);
});

test('tokenDelta: ratio is between 0 and 1', () => {
  const delta = tokenDelta('long text with many words in it for testing purposes', 'short');
  assert.ok(delta.ratio >= 0 && delta.ratio <= 1, `ratio out of range: ${delta.ratio}`);
});

test('tokenDelta: ratio is 0 when original is empty', () => {
  const delta = tokenDelta('', 'something');
  assert.equal(delta.ratio, 0);
});

test('tokenDelta: saved is never negative', () => {
  // compressed longer than original
  const delta = tokenDelta('hi', 'this is a much longer compressed string somehow');
  assert.ok(delta.saved >= 0);
});

test('tokenDelta: identical strings have saved=0 and ratio=0', () => {
  const text = 'hello world';
  const delta = tokenDelta(text, text);
  assert.equal(delta.saved, 0);
  assert.equal(delta.ratio, 0);
});

test('tokenDelta: handles null inputs', () => {
  const delta = tokenDelta(null, null);
  assert.equal(delta.original, 0);
  assert.equal(delta.compressed, 0);
  assert.equal(delta.saved, 0);
  assert.equal(delta.ratio, 0);
});

test('tokenDelta: high ratio for heavily compressed identity', () => {
  const original =
    'You are working on a Go project using a modular monolith architecture. ' +
    'Use errgroup for concurrency with context cancellation. ' +
    'Wrap errors with fmt.Errorf. Use slog for structured logging. ' +
    'Avoid circular imports. Use table-driven tests with testify.';
  const compressed = 'arch=modular_monolith concurrency=errgroup_ctx_cancel err_style=wrap_errorf lang=go logging=slog pkg_style=no_circular testing=table_driven_testify';
  const delta = tokenDelta(original, compressed);
  assert.ok(delta.ratio > 0.3, `Expected meaningful savings, got ratio=${delta.ratio}`);
});
