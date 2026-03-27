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

import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';

function findClaudeMdFiles(startDir) {
  const files = [];
  let current = startDir;

  // Walk up the directory tree collecting CLAUDE.md files
  while (current && current !== dirname(current)) {
    const candidate = join(current, 'CLAUDE.md');
    if (existsSync(candidate)) {
      files.push(candidate);
    }
    current = dirname(current);
  }

  return files;
}

function main() {
  try {
    const projectDir = process.env.CLAUDE_PROJECT_DIR;
    if (!projectDir) {
      // No project directory — nothing to do
      process.exit(0);
    }

    const claudeMdFiles = findClaudeMdFiles(projectDir);
    if (claudeMdFiles.length === 0) {
      // No CLAUDE.md files found — exit silently
      process.exit(0);
    }

    // Read all found CLAUDE.md files and concatenate
    let combinedContent = '';
    for (const filePath of claudeMdFiles) {
      try {
        const content = readFileSync(filePath, 'utf8');
        combinedContent += content + '\n';
      } catch {
        // Skip unreadable files
      }
    }

    if (!combinedContent.trim()) {
      process.exit(0);
    }

    const charCount = combinedContent.length;
    const fileList = claudeMdFiles.join(', ');

    // Output the suggestion for the assistant to act on
    const message = {
      message: `Found CLAUDE.md with ${charCount} chars (${claudeMdFiles.length} file(s): ${fileList}). Deriving codebook for identity compression. Please call mcp__engram-ccode__derive_codebook with the CLAUDE.md content, then call mcp__engram-ccode__compress_identity to compress the project identity for this session.`
    };

    process.stdout.write(JSON.stringify(message) + '\n');
  } catch {
    // Never crash — hook failures should be silent
    process.exit(0);
  }
}

main();
