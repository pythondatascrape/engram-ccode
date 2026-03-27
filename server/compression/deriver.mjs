/**
 * deriver.mjs — Pattern extraction from CLAUDE.md content.
 *
 * Scans CLAUDE.md text and extracts structured dimensions via regex/keyword
 * detection. No LLM calls — pure string operations.
 *
 * Extracted dimensions:
 *   lang, framework, build, testing, err_style, logging,
 *   arch, concurrency, transport, pkg_style
 */

import { readFile } from 'node:fs/promises';

// ---------------------------------------------------------------------------
// Section-aware parsing
// ---------------------------------------------------------------------------

/**
 * Split markdown content into sections keyed by heading text.
 * Returns an array of { heading, level, body } objects.
 * The first entry may have heading = '' for content before any heading.
 *
 * @param {string} text
 * @returns {Array<{ heading: string, level: number, body: string }>}
 */
function parseSections(text) {
  const lines = text.split('\n');
  const sections = [];
  let current = { heading: '', level: 0, body: '' };

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      sections.push(current);
      current = {
        heading: headingMatch[2].trim(),
        level: headingMatch[1].length,
        body: '',
      };
    } else {
      current.body += line + '\n';
    }
  }
  sections.push(current);
  return sections;
}

/**
 * Return concatenated body text for sections whose headings match any of the
 * given patterns (case-insensitive substring match).
 *
 * @param {Array<{ heading: string, body: string }>} sections
 * @param {string[]} headingPatterns
 * @returns {string}
 */
function bodiesForHeadings(sections, headingPatterns) {
  const pats = headingPatterns.map((p) => p.toLowerCase());
  return sections
    .filter((s) => pats.some((p) => s.heading.toLowerCase().includes(p)))
    .map((s) => s.body)
    .join('\n');
}

// ---------------------------------------------------------------------------
// Individual dimension detectors
// ---------------------------------------------------------------------------

const LANG_KEYWORDS = [
  { pattern: /\bgo\s+(build|test|run|mod|get|vet|fmt)\b/gi, lang: 'go', weight: 3 },
  { pattern: /\bgolang\b/gi, lang: 'go', weight: 2 },
  { pattern: /\b(go\.mod|go\.sum)\b/gi, lang: 'go', weight: 2 },
  { pattern: /\bfmt\.Errorf\b/g, lang: 'go', weight: 2 },
  { pattern: /\bcontext\.Context\b/g, lang: 'go', weight: 2 },
  { pattern: /\berrgroup\b/gi, lang: 'go', weight: 1 },
  { pattern: /\bgoroutine/gi, lang: 'go', weight: 1 },
  { pattern: /\bslog\b/gi, lang: 'go', weight: 1 },
  { pattern: /\bpython\b/gi, lang: 'python', weight: 2 },
  { pattern: /\bpip\s+install\b/gi, lang: 'python', weight: 3 },
  { pattern: /\bpytest\b/gi, lang: 'python', weight: 2 },
  { pattern: /\buv\s+run\b/gi, lang: 'python', weight: 2 },
  { pattern: /\bdjango\b/gi, lang: 'python', weight: 1 },
  { pattern: /\bflask\b/gi, lang: 'python', weight: 1 },
  { pattern: /\bfastapi\b/gi, lang: 'python', weight: 1 },
  { pattern: /\btypescript\b/gi, lang: 'typescript', weight: 3 },
  { pattern: /\btsc\b/gi, lang: 'typescript', weight: 3 },
  { pattern: /\btsconfig\b/gi, lang: 'typescript', weight: 3 },
  { pattern: /\.tsx\b/gi, lang: 'typescript', weight: 2 },
  { pattern: /\bjavascript\b/gi, lang: 'javascript', weight: 2 },
  { pattern: /\bnode\.?js\b/gi, lang: 'javascript', weight: 1 },
  { pattern: /\bnpm\s+(install|run|test|start|build)\b/gi, lang: 'javascript', weight: 1 },
  { pattern: /\byarn\s+(add|run|test|build)\b/gi, lang: 'javascript', weight: 1 },
  { pattern: /\brust\b/gi, lang: 'rust', weight: 2 },
  { pattern: /\bcargo\s+(build|test|run|check)\b/gi, lang: 'rust', weight: 3 },
  { pattern: /\bjava\b/gi, lang: 'java', weight: 1 },
  { pattern: /\bmaven\b/gi, lang: 'java', weight: 2 },
  { pattern: /\bgradle\b/gi, lang: 'java', weight: 2 },
  { pattern: /\bruby\b/gi, lang: 'ruby', weight: 2 },
  { pattern: /\bbundle\s+(install|exec)\b/gi, lang: 'ruby', weight: 2 },
];

/**
 * Detect primary language.
 * Uses weighted scoring. Build-section mentions get a 2x multiplier.
 */
function detectLang(fullText, sections) {
  const buildText = bodiesForHeadings(sections, ['build', 'run', 'install', 'setup']);
  const scores = {};

  for (const { pattern, lang, weight } of LANG_KEYWORDS) {
    // Reset lastIndex for global regexes.
    pattern.lastIndex = 0;
    const fullMatches = fullText.match(new RegExp(pattern.source, pattern.flags)) ?? [];
    pattern.lastIndex = 0;
    const buildMatches = buildText.match(new RegExp(pattern.source, pattern.flags)) ?? [];

    scores[lang] = (scores[lang] ?? 0) + fullMatches.length * weight + buildMatches.length * weight * 2;
  }

  // TypeScript subsumes JavaScript: if both have scores and TypeScript is
  // explicitly mentioned, TypeScript wins (npm/yarn are shared tooling).
  if (scores.typescript > 0 && scores.javascript > 0) {
    scores.typescript += scores.javascript;
    delete scores.javascript;
  }

  let best = null;
  let bestScore = 0;
  for (const [lang, score] of Object.entries(scores)) {
    if (score > bestScore) {
      best = lang;
      bestScore = score;
    }
  }
  // Require a minimum confidence threshold.
  return bestScore >= 2 ? best : null;
}

const FRAMEWORK_PATTERNS = [
  { pattern: /\breact\b/gi, value: 'react' },
  { pattern: /\bnext\.?js\b/gi, value: 'nextjs' },
  { pattern: /\bvue\b/gi, value: 'vue' },
  { pattern: /\bangular\b/gi, value: 'angular' },
  { pattern: /\bsvelte\b/gi, value: 'svelte' },
  { pattern: /\bexpress\b/gi, value: 'express' },
  { pattern: /\bfastify\b/gi, value: 'fastify' },
  { pattern: /\bdjango\b/gi, value: 'django' },
  { pattern: /\bflask\b/gi, value: 'flask' },
  { pattern: /\bfastapi\b/gi, value: 'fastapi' },
  { pattern: /\brails\b/gi, value: 'rails' },
  { pattern: /\bspring\b/gi, value: 'spring' },
  { pattern: /\bgin\b/gi, value: 'gin' },
  { pattern: /\becho\b/gi, value: 'echo' },
  { pattern: /\bfiber\b/gi, value: 'fiber' },
];

function detectFramework(fullText) {
  const found = [];
  for (const { pattern, value } of FRAMEWORK_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(fullText)) {
      found.push(value);
    }
  }
  if (found.length === 0) return null;
  return found.length === 1 ? found[0] : found.join(',');
}

const BUILD_PATTERNS = [
  { pattern: /\bgo\s+build\b/gi, value: 'go_build' },
  { pattern: /\bnpm\s+(run\s+)?build\b/gi, value: 'npm' },
  { pattern: /\byarn\s+(run\s+)?build\b/gi, value: 'yarn' },
  { pattern: /\bcargo\s+build\b/gi, value: 'cargo' },
  { pattern: /\bmake\b/gi, value: 'make' },
  { pattern: /\bmaven\b|\bmvn\b/gi, value: 'maven' },
  { pattern: /\bgradle\b/gi, value: 'gradle' },
  { pattern: /\bpip\s+install\b/gi, value: 'pip' },
  { pattern: /\buv\s+(run|add)\b/gi, value: 'uv' },
  { pattern: /\bbuf\s+generate\b/gi, value: 'buf' },
  { pattern: /\btsc\b/gi, value: 'tsc' },
  { pattern: /\bwebpack\b/gi, value: 'webpack' },
  { pattern: /\bvite\b/gi, value: 'vite' },
  { pattern: /\bbundle\s+(install|exec)\b/gi, value: 'bundler' },
];

function detectBuild(fullText, sections) {
  const buildText = bodiesForHeadings(sections, ['build', 'run', 'install', 'setup', 'proto']);
  const searchText = buildText || fullText;
  const found = [];

  for (const { pattern, value } of BUILD_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(searchText)) {
      if (!found.includes(value)) found.push(value);
    }
  }
  if (found.length === 0) return null;
  return found.join(',');
}

function detectTesting(fullText, sections) {
  const testText = bodiesForHeadings(sections, ['test', 'conventions', 'best practices']);
  const searchText = testText || fullText;
  const parts = [];

  if (/\btable[- ]driven\b/i.test(searchText)) parts.push('table_driven');
  if (/\btestify\b/i.test(searchText)) parts.push('testify');
  if (/\bpytest\b/i.test(searchText)) parts.push('pytest');
  if (/\bjest\b/i.test(searchText)) parts.push('jest');
  if (/\bvitest\b/i.test(searchText)) parts.push('vitest');
  if (/\bmocha\b/i.test(searchText)) parts.push('mocha');
  if (/\brspec\b/i.test(searchText)) parts.push('rspec');
  if (/\bjunit\b/i.test(searchText)) parts.push('junit');
  if (/\bgo\s+test\b/i.test(searchText)) parts.push('go_test');
  if (/\b-race\b/i.test(searchText)) parts.push('race_detector');
  if (/\bunittest\b/i.test(searchText)) parts.push('unittest');

  if (parts.length === 0) return null;
  return parts.join('_');
}

function detectErrStyle(fullText, sections) {
  const convText = bodiesForHeadings(sections, ['conventions', 'best practices', 'error']);
  const searchText = convText || fullText;
  const parts = [];

  if (/fmt\.Errorf.*%w/i.test(searchText) || /wrap.*err/i.test(searchText)) parts.push('wrap_errorf');
  if (/errors\.(Is|As)\b/i.test(searchText)) parts.push('sentinel');
  if (/don't panic\b|don't\s+panic\b|no\s+panic/i.test(searchText) || /Return errors,?\s*don.t panic/i.test(searchText)) parts.push('no_panic');
  if (/try[/-]catch\b/i.test(searchText)) parts.push('try_catch');
  if (/Result<|\.unwrap\(\)/i.test(searchText)) parts.push('result_type');

  if (parts.length === 0) return null;
  return parts.join('_');
}

function detectLogging(fullText, sections) {
  const convText = bodiesForHeadings(sections, ['conventions', 'best practices', 'logging']);
  const searchText = convText || fullText;

  if (/\bslog\b/i.test(searchText)) {
    if (/structured/i.test(searchText)) return 'slog_structured';
    return 'slog';
  }
  if (/\bwinston\b/i.test(searchText)) return 'winston';
  if (/\bpino\b/i.test(searchText)) return 'pino';
  if (/\blog4j\b/i.test(searchText)) return 'log4j';
  if (/\blogback\b/i.test(searchText)) return 'logback';
  if (/\blogrus\b/i.test(searchText)) return 'logrus';
  if (/\bzap\b/i.test(searchText)) return 'zap';
  if (/\blogging\b.*\bmodule\b/i.test(searchText)) return 'stdlib';
  if (/structured\s+log/i.test(searchText)) return 'structured';

  return null;
}

function detectArch(fullText) {
  if (/modular\s+monolith/i.test(fullText)) return 'modular_monolith';
  if (/microservice/i.test(fullText)) return 'microservices';
  if (/monolith/i.test(fullText)) return 'monolith';
  if (/serverless/i.test(fullText)) return 'serverless';
  if (/event[- ]driven/i.test(fullText)) return 'event_driven';
  if (/hexagonal/i.test(fullText)) return 'hexagonal';
  if (/clean\s+architecture/i.test(fullText)) return 'clean_architecture';
  return null;
}

function detectConcurrency(fullText, sections) {
  const convText = bodiesForHeadings(sections, ['conventions', 'best practices', 'concurrency']);
  const searchText = convText || fullText;
  const parts = [];

  if (/\berrgroup\b/i.test(searchText)) parts.push('errgroup');
  if (/context\s+cancel/i.test(searchText) || /ctx.*cancel/i.test(searchText) || /context\.Context/i.test(searchText)) parts.push('ctx_cancel');
  if (/\bgoroutine/i.test(searchText)) parts.push('goroutines');
  if (/\basync\s*\/?\s*await\b/i.test(searchText)) parts.push('async_await');
  if (/\bpromise/i.test(searchText)) parts.push('promises');
  if (/\bchannel/i.test(searchText) && /\bgo\b/i.test(fullText)) parts.push('channels');
  if (/\btokio\b/i.test(searchText)) parts.push('tokio');
  if (/\bthread\s*pool/i.test(searchText)) parts.push('thread_pool');

  if (parts.length === 0) return null;
  return parts.join('_');
}

function detectTransport(fullText) {
  const found = [];

  if (/\bQUIC\b/i.test(fullText)) found.push('quic');
  if (/\bWebSocket\b/i.test(fullText)) found.push('websocket');
  if (/\bgRPC\b/i.test(fullText)) found.push('grpc');
  if (/\bREST\b/i.test(fullText)) found.push('rest');
  if (/\bHTTP\/2\b/i.test(fullText)) found.push('http2');
  if (/\bWebTransport\b/i.test(fullText)) found.push('webtransport');
  if (/\bGraphQL\b/i.test(fullText)) found.push('graphql');
  if (/\bTCP\b/i.test(fullText)) found.push('tcp');

  if (found.length === 0) return null;
  return found.join(',');
}

function detectPkgStyle(fullText, sections) {
  const convText = bodiesForHeadings(sections, ['conventions', 'best practices', 'package', 'structure', 'not to do']);
  const searchText = convText || fullText;
  const parts = [];

  if (/no\s+circular/i.test(searchText) || /circular\s+import/i.test(searchText)) parts.push('no_circular');
  if (/barrel\s+export/i.test(searchText)) parts.push('barrel_exports');
  if (/internal\s+package/i.test(searchText)) parts.push('internal_pkg');
  if (/define\s+where\s+consumed/i.test(searchText)) parts.push('interface_at_consumer');

  if (parts.length === 0) return null;
  return parts.join(',');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Derive structured dimensions from CLAUDE.md content.
 *
 * @param {string} claudeMdContent — raw text of one or more CLAUDE.md files
 * @returns {Object} — key/value map of detected dimensions
 */
export function deriveDimensions(claudeMdContent) {
  if (!claudeMdContent || typeof claudeMdContent !== 'string' || claudeMdContent.trim() === '') {
    return {};
  }

  const sections = parseSections(claudeMdContent);
  const fullText = claudeMdContent;
  const dims = {};

  const lang = detectLang(fullText, sections);
  if (lang) dims.lang = lang;

  const framework = detectFramework(fullText);
  if (framework) dims.framework = framework;

  const build = detectBuild(fullText, sections);
  if (build) dims.build = build;

  const testing = detectTesting(fullText, sections);
  if (testing) dims.testing = testing;

  const errStyle = detectErrStyle(fullText, sections);
  if (errStyle) dims.err_style = errStyle;

  const logging = detectLogging(fullText, sections);
  if (logging) dims.logging = logging;

  const arch = detectArch(fullText);
  if (arch) dims.arch = arch;

  const concurrency = detectConcurrency(fullText, sections);
  if (concurrency) dims.concurrency = concurrency;

  const transport = detectTransport(fullText);
  if (transport) dims.transport = transport;

  const pkgStyle = detectPkgStyle(fullText, sections);
  if (pkgStyle) dims.pkg_style = pkgStyle;

  return dims;
}

/**
 * Read CLAUDE.md files from disk, concatenate, and derive dimensions.
 *
 * @param {string[]} filePaths — absolute paths to CLAUDE.md files
 * @returns {Promise<Object>} — derived dimensions
 */
export async function deriveFromFiles(filePaths) {
  if (!filePaths || !Array.isArray(filePaths) || filePaths.length === 0) {
    return {};
  }

  const parts = [];
  for (const fp of filePaths) {
    try {
      const content = await readFile(fp, 'utf-8');
      parts.push(content);
    } catch {
      // Skip files that can't be read (missing, permission denied, etc.)
    }
  }

  if (parts.length === 0) return {};
  return deriveDimensions(parts.join('\n\n---\n\n'));
}
