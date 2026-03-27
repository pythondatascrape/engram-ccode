/**
 * codebook.mjs — Codebook lifecycle: loading, caching, merging.
 *
 * A codebook wraps derived dimensions with metadata (hash, timestamp).
 * YAML overrides let users refine or suppress auto-derived values.
 * SHA-256 hashing enables cache invalidation when CLAUDE.md changes.
 */

import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import yaml from 'js-yaml';

// ---------------------------------------------------------------------------
// Codebook creation
// ---------------------------------------------------------------------------

/**
 * Wrap raw dimensions in a codebook object.
 *
 * @param {Object} dimensions — key/value dimension map
 * @returns {{ dimensions: Object, hash: string, timestamp: string }}
 */
export function createCodebook(dimensions) {
  const dims = dimensions && typeof dimensions === 'object' ? { ...dimensions } : {};
  return {
    dimensions: dims,
    hash: computeHash(JSON.stringify(dims)),
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// YAML overrides
// ---------------------------------------------------------------------------

/**
 * Load a .engram-codebook.yaml override file.
 * Returns parsed overrides object, or null if the file doesn't exist.
 *
 * Expected YAML format:
 *   dimensions:
 *     lang:
 *       type: enum
 *       value: go
 *     custom_key:
 *       type: freeform
 *       value: some_value
 *     suppressed_key:
 *       type: enum
 *       value: null
 *
 * @param {string} yamlPath
 * @returns {Promise<Object|null>}
 */
export async function loadYamlOverrides(yamlPath) {
  try {
    const raw = await readFile(yamlPath, 'utf-8');
    const parsed = yaml.load(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    // Re-throw unexpected errors (bad YAML syntax, permission issues, etc.)
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Merge rules
// ---------------------------------------------------------------------------

/**
 * Merge auto-derived dimensions with YAML overrides.
 *
 * Rules:
 *   1. Start with all auto-derived dimensions.
 *   2. YAML values override auto-derived for matching keys.
 *   3. YAML can add new dimensions not in auto-derived.
 *   4. YAML can suppress with value: null (removes dimension).
 *   5. Return merged dimensions.
 *
 * @param {Object} derived — auto-derived dimensions (key=value)
 * @param {Object|null} overrides — parsed YAML overrides object
 * @returns {Object} — merged dimension map
 */
export function mergeCodebook(derived, overrides) {
  const merged = { ...(derived ?? {}) };

  if (!overrides || typeof overrides !== 'object') return merged;

  // The overrides object has a `dimensions` key containing the dimension map.
  const dimOverrides = overrides.dimensions;
  if (!dimOverrides || typeof dimOverrides !== 'object') return merged;

  for (const [key, spec] of Object.entries(dimOverrides)) {
    if (!spec || typeof spec !== 'object') continue;

    if (spec.value === null || spec.value === undefined) {
      // Rule 4: suppress — remove the dimension.
      delete merged[key];
    } else {
      // Rule 2 & 3: override or add.
      merged[key] = String(spec.value);
    }
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

/**
 * Compute a SHA-256 hex hash of string content.
 *
 * @param {string} content
 * @returns {string} — hex digest
 */
export function computeHash(content) {
  return createHash('sha256').update(String(content ?? '')).digest('hex');
}

// ---------------------------------------------------------------------------
// Cache persistence
// ---------------------------------------------------------------------------

/**
 * Load a cached codebook from disk.
 * Returns null if the file is missing or contains invalid JSON.
 *
 * @param {string} cachePath
 * @returns {Promise<Object|null>}
 */
export async function loadCache(cachePath) {
  try {
    const raw = await readFile(cachePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.contentHash) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Save a codebook and its content hash to disk as JSON.
 * Creates parent directories if needed.
 *
 * @param {string} cachePath
 * @param {{ dimensions: Object, hash: string, timestamp: string }} codebook
 * @param {string} contentHash — SHA-256 of the source CLAUDE.md content
 */
export async function saveCache(cachePath, codebook, contentHash) {
  const payload = {
    codebook,
    contentHash,
    cachedAt: new Date().toISOString(),
  };
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify(payload, null, 2), 'utf-8');
}

/**
 * Check whether a cached codebook is still valid by comparing content hashes.
 *
 * @param {Object|null} cache — loaded cache object
 * @param {string} currentContentHash — SHA-256 of current CLAUDE.md content
 * @returns {boolean}
 */
export function isCacheValid(cache, currentContentHash) {
  if (!cache || typeof cache !== 'object') return false;
  if (!cache.contentHash || !currentContentHash) return false;
  return cache.contentHash === currentContentHash;
}
