/**
 * tokenizer.mjs — Approximate token counting utility.
 *
 * Uses a word-boundary heuristic (~4 chars per token) for fast accounting.
 * Not suitable for billing; suitable for tracking compression savings.
 */

/**
 * Count approximate tokens in a string.
 * Splits on whitespace/punctuation boundaries; falls back to char/4.
 *
 * @param {string|null|undefined} text
 * @returns {number}
 */
export function countTokens(text) {
  if (text == null || text === '') return 0;
  const str = String(text);
  if (str.trim() === '') return 0;
  // Split on whitespace + common punctuation to approximate GPT-style tokenization.
  // Words are typically 1 token; punctuation runs add a few more.
  const wordMatches = str.match(/\S+/g) ?? [];
  // Each "word" averages ~1.3 tokens (accounts for sub-word splits on long/technical words).
  // For simplicity, use char/4 as the baseline and blend with word count.
  const byChars = Math.ceil(str.length / 4);
  const byWords = Math.ceil(wordMatches.length * 1.3);
  // Return the average of the two estimates for better accuracy.
  return Math.ceil((byChars + byWords) / 2);
}

/**
 * Compute token savings between an original and compressed text.
 *
 * @param {string|null|undefined} original
 * @param {string|null|undefined} compressed
 * @returns {{ original: number, compressed: number, saved: number, ratio: number }}
 */
export function tokenDelta(original, compressed) {
  const origTokens = countTokens(original);
  const compTokens = countTokens(compressed);
  const saved = Math.max(0, origTokens - compTokens);
  const ratio = origTokens > 0 ? saved / origTokens : 0;
  return {
    original: origTokens,
    compressed: compTokens,
    saved,
    ratio: Math.round(ratio * 10000) / 10000, // 4 decimal places
  };
}
