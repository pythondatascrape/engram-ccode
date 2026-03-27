/**
 * serializer.mjs — Deterministic identity serializer.
 *
 * Mirrors Engram's Go serializer format:
 *   alphabetically sorted key=value pairs, space-delimited, single line.
 *
 * Example output:
 *   "arch=modular_monolith concurrency=errgroup_ctx_cancel err_style=wrap_errorf lang=go"
 */

/**
 * Normalize a value: lowercase, trim, replace spaces with underscores.
 *
 * @param {string} val
 * @returns {string}
 */
function normalizeValue(val) {
  return String(val).toLowerCase().trim().replace(/\s+/g, '_');
}

/**
 * Normalize a key: lowercase, trim.
 *
 * @param {string} key
 * @returns {string}
 */
function normalizeKey(key) {
  return String(key).toLowerCase().trim();
}

/**
 * Serialize an object or Map of dimensions into a compact, deterministic string.
 *
 * @param {Object|Map} dimensions
 * @returns {string}
 */
export function serialize(dimensions) {
  if (dimensions == null) return '';

  let entries;
  if (dimensions instanceof Map) {
    entries = [...dimensions.entries()];
  } else if (typeof dimensions === 'object') {
    entries = Object.entries(dimensions);
  } else {
    return '';
  }

  const pairs = [];
  for (const [rawKey, rawVal] of entries) {
    if (rawVal == null || rawVal === '') continue;
    const key = normalizeKey(rawKey);
    const val = normalizeValue(rawVal);
    if (key === '' || val === '') continue;
    pairs.push(`${key}=${val}`);
  }

  // Alphabetical sort for determinism.
  pairs.sort();
  return pairs.join(' ');
}

/**
 * Deserialize a serialized identity string back into a plain object.
 *
 * @param {string|null|undefined} serialized
 * @returns {Object}
 */
export function deserialize(serialized) {
  if (serialized == null || serialized === '') return {};
  const str = String(serialized).trim();
  if (str === '') return {};

  const result = {};
  const tokens = str.split(/\s+/);
  for (const token of tokens) {
    const eqIdx = token.indexOf('=');
    if (eqIdx < 1) continue; // skip malformed tokens (no '=' or empty key)
    const key = token.slice(0, eqIdx);
    const val = token.slice(eqIdx + 1);
    if (key && val !== undefined) {
      result[key] = val;
    }
  }
  return result;
}

/**
 * Wrap a serialized identity string in a markdown-style identity block.
 *
 * @param {string} serialized
 * @returns {string}
 */
export function formatBlock(serialized) {
  const body = serialized == null ? '' : String(serialized);
  return `[identity]\n${body}\n[/identity]`;
}
