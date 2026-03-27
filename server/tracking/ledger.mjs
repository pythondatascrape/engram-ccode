/**
 * ledger.mjs — Session-level token accounting.
 *
 * Records compression events and redundancy hits, accumulates savings,
 * and exposes per-session statistics for reporting.
 */

import { tokenDelta } from './tokenizer.mjs';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Record a compression event (e.g., at session start when identity block
  // is built). original/compressed are the full text strings.
  // ---------------------------------------------------------------------------
  /**
   * @param {string} original
   * @param {string} compressed
   */
  function recordCompression(original, compressed) {
    const delta = tokenDelta(original, compressed);
    compressions.push({
      timestamp: new Date().toISOString(),
      originalTokens: delta.original,
      compressedTokens: delta.compressed,
      saved: delta.saved,
      ratio: delta.ratio,
    });
  }

  // ---------------------------------------------------------------------------
  // Record a redundancy detection hit.
  // ---------------------------------------------------------------------------
  /**
   * @param {string[]} matches — dimension keys that were redundantly found
   * @param {number} tokens — approximate token count of the redundant content
   */
  function recordRedundancy(matches, tokens) {
    redundancies.push({
      timestamp: new Date().toISOString(),
      matches: Array.isArray(matches) ? [...matches] : [],
      tokens: typeof tokens === 'number' ? tokens : 0,
    });
  }

  // ---------------------------------------------------------------------------
  // Compute and return current session statistics.
  // ---------------------------------------------------------------------------
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
    const totalOriginalTokens = compressions.reduce((sum, c) => sum + c.originalTokens, 0);
    const totalCompressedTokens = compressions.reduce((sum, c) => sum + c.compressedTokens, 0);
    const totalSaved = compressions.reduce((sum, c) => sum + c.saved, 0);
    const totalRedundancyHits = redundancies.length;
    const totalRedundantTokens = redundancies.reduce((sum, r) => sum + r.tokens, 0);
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
      totalRedundancyHits,
      totalRedundantTokens,
      overallRatio,
    };
  }

  // ---------------------------------------------------------------------------
  // Notify check: return true if accumulated redundant tokens exceed threshold.
  // ---------------------------------------------------------------------------
  /**
   * @param {number} [threshold=10000]
   * @returns {boolean}
   */
  function shouldNotify(threshold = 10000) {
    const totalRedundantTokens = redundancies.reduce((sum, r) => sum + r.tokens, 0);
    return totalRedundantTokens > threshold;
  }

  // ---------------------------------------------------------------------------
  // Reset all session stats (start fresh).
  // ---------------------------------------------------------------------------
  function reset() {
    sessionStart = new Date().toISOString();
    compressions = [];
    redundancies = [];
  }

  return {
    recordCompression,
    recordRedundancy,
    getStats,
    shouldNotify,
    reset,
  };
}
