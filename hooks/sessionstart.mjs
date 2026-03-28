#!/usr/bin/env node
/**
 * SessionStart hook for engram-ccode.
 *
 * Runs when a new Claude Code session begins. Looks for CLAUDE.md files in
 * the project directory and its parents, then outputs a message instructing
 * the assistant to call derive_codebook and compress_identity.
 *
 * Hooks cannot call MCP tools directly — they communicate by printing to
 * stdout, which becomes additional context for the assistant.
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';

/**
 * Walk up from startDir collecting CLAUDE.md paths and their content in one pass.
 * @returns {Array<{ path: string, content: string }>}
 */
function collectClaudeMd(startDir) {
  const results = [];
  let current = startDir;

  while (current && current !== dirname(current)) {
    const candidate = join(current, 'CLAUDE.md');
    try {
      const content = readFileSync(candidate, 'utf8');
      results.push({ path: candidate, content });
    } catch {
      // File doesn't exist or isn't readable — skip
    }
    current = dirname(current);
  }

  return results;
}

function main() {
  try {
    const projectDir = process.env.CLAUDE_PROJECT_DIR;
    if (!projectDir) {
      process.exit(0);
    }

    const files = collectClaudeMd(projectDir);
    if (files.length === 0) {
      process.exit(0);
    }

    const combinedContent = files.map((f) => f.content).join('\n');
    if (!combinedContent.trim()) {
      process.exit(0);
    }

    const fileList = files.map((f) => f.path).join(', ');

    const message = {
      message: `Found CLAUDE.md with ${combinedContent.length} chars (${files.length} file(s): ${fileList}). Deriving codebook for identity compression. Please call mcp__engram-ccode__derive_codebook with the CLAUDE.md content, then call mcp__engram-ccode__compress_identity to compress the project identity for this session.`
    };

    process.stdout.write(JSON.stringify(message) + '\n');
  } catch {
    process.exit(0);
  }
}

main();
