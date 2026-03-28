/**
 * ledger.mjs — Session-level token accounting.
 *
 * Records compression events and redundancy hits, accumulates savings,
 * and exposes per-session statistics for reporting.
 */

import { tokenDelta } from './tokenizer.mjs';

const MAX_EVENTS = 1000;

/**
 * Create a new session ledger.
 *
 * @returns {{
 *   recordCompression: Function,
 *   recordRedundancy: Function,
 *   getStats: Function,
 *   shouldNotify: Function,
 *   reset: Function,
 * }}
 */
export function createLedger() {
  let sessionStart = new Date().toISOString();
  let compressions = [];
  let redundancies = [];

  // Running accumulators — avoids re-reducing arrays on every getStats/shouldNotify call
  let totalOriginalTokens = 0;
  let totalCompressedTokens = 0;
  let totalSaved = 0;
  let totalRedundantTokens = 0;

  /**
   * @param {string} original
   * @param {string} compressed
   * @returns {{ original: number, compressed: number, saved: number, ratio: number }}
   */
  function recordCompression(original, compressed) {
    const delta = tokenDelta(original, compressed);
    if (compressions.length >= MAX_EVENTS) compressions.shift();
    compressions.push({
      timestamp: new Date().toISOString(),
      originalTokens: delta.original,
      compressedTokens: delta.compressed,
      saved: delta.saved,
      ratio: delta.ratio,
    });
    totalOriginalTokens += delta.original;
    totalCompressedTokens += delta.compressed;
    totalSaved += delta.saved;
    return delta;
  }

  /**
   * @param {string[]} matches — dimension keys that were redundantly found
   * @param {number} tokens — approximate token count of the redundant content
   */
  function recordRedundancy(matches, tokens) {
    const safeTokens = typeof tokens === 'number' ? tokens : 0;
    if (redundancies.length >= MAX_EVENTS) redundancies.shift();
    redundancies.push({
      timestamp: new Date().toISOString(),
      matches: Array.isArray(matches) ? [...matches] : [],
      tokens: safeTokens,
    });
    totalRedundantTokens += safeTokens;
  }

  /**
   * @returns {{
   *   sessionStart: string,
   *   compressions: Array,
   *   redundancies: Array,
   *   totalOriginalTokens: number,
   *   totalCompressedTokens: number,
   *   totalSaved: number,
   *   totalRedundancyHits: number,
   *   totalRedundantTokens: number,
   *   overallRatio: number,
   * }}
   */
  function getStats() {
    const overallRatio = totalOriginalTokens > 0
      ? Math.round((totalSaved / totalOriginalTokens) * 10000) / 10000
      : 0;

    return {
      sessionStart,
      compressions: compressions.map((c) => ({ ...c })),
      redundancies: redundancies.map((r) => ({ ...r, matches: [...r.matches] })),
      totalOriginalTokens,
      totalCompressedTokens,
      totalSaved,
      totalRedundancyHits: redundancies.length,
      totalRedundantTokens,
      overallRatio,
    };
  }

  /**
   * @param {number} [threshold=10000]
   * @returns {boolean}
   */
  function shouldNotify(threshold = 10000) {
    return totalRedundantTokens > threshold;
  }

  function reset() {
    sessionStart = new Date().toISOString();
    compressions = [];
    redundancies = [];
    totalOriginalTokens = 0;
    totalCompressedTokens = 0;
    totalSaved = 0;
    totalRedundantTokens = 0;
  }

  return {
    recordCompression,
    recordRedundancy,
    getStats,
    shouldNotify,
    reset,
  };
}
