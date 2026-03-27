/**
 * detector.mjs — Mid-session redundancy detection.
 *
 * Compares tool output content against established codebook dimensions to
 * detect when a tool response is redundantly reinforcing identity already
 * captured in the identity block.
 *
 * Detection is fast string-matching (case-insensitive); no regex-heavy ops.
 * Sub-millisecond target per check.
 */

import { countTokens } from '../tracking/tokenizer.mjs';

// ---------------------------------------------------------------------------
// Dimension keyword maps
// ---------------------------------------------------------------------------

/**
 * For each known dimension key and value pattern, define the keywords that
 * signal redundant reinforcement in tool output.
 *
 * Each entry: dimensionKey → { valuePattern, keywords[] }
 * Keywords are checked case-insensitively via indexOf.
 */
const DIMENSION_KEYWORDS = {
  lang: {
    go: ['golang', ' go ', '\ngo\n', 'go language', 'written in go', 'go programming', 'go code', 'go project', 'go module'],
    python: ['python', 'py3', 'python3', 'python language'],
    typescript: ['typescript', 'ts ', '.ts ', 'typescriptlang'],
    javascript: ['javascript', 'js ', '.js ', 'node.js', 'nodejs'],
    rust: ['rust ', 'rustlang', 'rust language', 'cargo.toml'],
    java: ['java ', 'jvm ', '.java'],
    ruby: ['ruby ', 'rails ', 'rubygems'],
  },
  err_style: {
    wrap_errorf: ['fmt.errorf', 'errorf(', 'wrap error', 'wrapped error', 'errors.wrap', '%w', 'wrapping error', 'error wrapping'],
    sentinel: ['errors.new', 'var err', 'sentinel error'],
    panic: ['panic(', 'recover('],
  },
  logging: {
    slog: ['slog.', 'log/slog', 'structured log', 'slog package'],
    zap: ['zap.', 'go.uber.org/zap', 'zap logger'],
    logrus: ['logrus.', 'sirupsen/logrus'],
    zerolog: ['zerolog.', 'rs/zerolog'],
    fmt: ['fmt.println', 'fmt.printf', 'log.println'],
  },
  testing: {
    table_driven: ['table.driven', 'table-driven', 'test cases', 'testcases', 'subtests', 't.run('],
    testify: ['testify', 'assert.equal', 'require.equal', 'assert.no', 'stretchr/testify'],
    table_driven_testify: ['table.driven', 'table-driven', 'testify', 'assert.equal', 'require.equal'],
  },
  arch: {
    modular_monolith: ['modular monolith', 'monolith', 'single binary', 'monorepo'],
    microservices: ['microservice', 'micro-service', 'service mesh'],
    serverless: ['serverless', 'lambda', 'faas'],
  },
  concurrency: {
    errgroup_ctx_cancel: ['errgroup', 'context.cancel', 'ctx cancel', 'waitgroup', 'goroutine lifecycle'],
    goroutines: ['goroutine', 'go func(', 'go routine'],
    channels: ['channel', 'chan ', '<-chan', 'chan<-'],
  },
  transport: {
    quic: ['quic', 'http/3', 'http3', 'quic-go'],
    grpc: ['grpc', 'protobuf', '.proto', 'rpc '],
    websocket: ['websocket', 'ws://', 'wss://'],
    http: ['http.handlefunc', 'net/http', 'rest api', 'http server'],
  },
  pkg_style: {
    no_circular: ['circular import', 'circular dependency', 'import cycle', 'no circular'],
  },
  framework: {
    gin: ['gin.', 'gin-gonic', 'gin router'],
    echo: ['echo.', 'labstack/echo'],
    fiber: ['fiber.', 'gofiber'],
    chi: ['chi.', 'go-chi'],
  },
};

// Minimum token threshold — skip short content (not worth checking).
const MIN_TOKENS = 200;

// ---------------------------------------------------------------------------
// Core detection logic
// ---------------------------------------------------------------------------

/**
 * Get the keyword list for a given dimension key + value.
 *
 * @param {string} key — dimension key (e.g., "lang")
 * @param {string} value — dimension value (e.g., "go")
 * @returns {string[]} — array of lowercase keywords to search for
 */
function keywordsForDimension(key, value) {
  const keyMap = DIMENSION_KEYWORDS[key];
  if (!keyMap) return [];

  // Exact value match first.
  if (keyMap[value]) return keyMap[value];

  // Partial value match (e.g., "table_driven_testify" contains "table_driven").
  for (const [pattern, keywords] of Object.entries(keyMap)) {
    if (value.includes(pattern) || pattern.includes(value)) {
      return keywords;
    }
  }

  // Fallback: use the value itself as a keyword.
  return [value.replace(/_/g, ' ')];
}

/**
 * Check if content (lowercased) contains any of the given keywords.
 *
 * @param {string} lowerContent — pre-lowercased content
 * @param {string[]} keywords
 * @returns {boolean}
 */
function anyKeywordPresent(lowerContent, keywords) {
  for (const kw of keywords) {
    if (lowerContent.includes(kw)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a redundancy detector for the given codebook.
 *
 * @param {{ dimensions: Object } | Object} codebook
 * @returns {{ check: Function, updateCodebook: Function }}
 */
export function createDetector(codebook) {
  // Support both { dimensions: {...} } and plain dimension maps.
  let dimensions = extractDimensions(codebook);

  /**
   * Check tool output content for redundant identity reinforcement.
   *
   * @param {string} content
   * @returns {{ redundant: boolean, matches: string[], tokens: number }}
   */
  function check(content) {
    if (!content || typeof content !== 'string') {
      return { redundant: false, matches: [], tokens: 0 };
    }

    const tokens = countTokens(content);

    // Skip short content.
    if (tokens < MIN_TOKENS) {
      return { redundant: false, matches: [], tokens };
    }

    const lower = content.toLowerCase();
    const matches = [];

    for (const [key, value] of Object.entries(dimensions)) {
      if (!value || typeof value !== 'string') continue;

      const keywords = keywordsForDimension(key, value.toLowerCase());
      if (anyKeywordPresent(lower, keywords)) {
        matches.push(key);
      }
    }

    return {
      redundant: matches.length > 0,
      matches,
      tokens,
    };
  }

  /**
   * Update the codebook the detector compares against.
   *
   * @param {{ dimensions: Object } | Object} newCodebook
   */
  function updateCodebook(newCodebook) {
    dimensions = extractDimensions(newCodebook);
  }

  return { check, updateCodebook };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract a plain dimension map from a codebook (which may be
 * `{ dimensions: {...} }` or a raw dimension object).
 *
 * @param {any} codebook
 * @returns {Object}
 */
function extractDimensions(codebook) {
  if (!codebook || typeof codebook !== 'object') return {};
  if (codebook.dimensions && typeof codebook.dimensions === 'object') {
    return { ...codebook.dimensions };
  }
  return { ...codebook };
}
