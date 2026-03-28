#!/usr/bin/env node
/**
 * PostToolUse hook for engram-ccode.
 *
 * Runs after every tool result. Reads the tool result from stdin and, if the
 * output is long enough to be worth analysing, outputs a message suggesting
 * the assistant call check_redundancy.
 *
 * This hook is strictly passive/observational — it never modifies tool output.
 * It also skips our own MCP tools to avoid feedback loops.
 */

import { createInterface } from 'readline';
import { countTokens } from '../server/tracking/tokenizer.mjs';

const MIN_TOKENS_TO_CHECK = 200;
// Our own MCP tool prefix — skip these to prevent loops
const OWN_TOOL_PREFIX = 'mcp__engram-ccode';

async function readStdin() {
  return new Promise((resolve) => {
    const lines = [];
    const rl = createInterface({ input: process.stdin, terminal: false });

    rl.on('line', (line) => lines.push(line));
    rl.on('close', () => resolve(lines.join('\n')));

    // If stdin isn't a pipe, resolve immediately after a short tick
    if (process.stdin.isTTY) {
      resolve('');
    }
  });
}

async function main() {
  try {
    const raw = await readStdin();
    if (!raw.trim()) {
      process.exit(0);
    }

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      // Malformed input — exit silently
      process.exit(0);
    }

    const toolName = typeof payload.tool_name === 'string' ? payload.tool_name : '';
    const toolOutput = typeof payload.tool_output === 'string' ? payload.tool_output : '';

    // Skip our own MCP tools to prevent feedback loops
    if (toolName.startsWith(OWN_TOOL_PREFIX)) {
      process.exit(0);
    }

    // Skip empty or very short outputs
    const estimatedTokens = countTokens(toolOutput);
    if (!toolOutput || estimatedTokens < MIN_TOKENS_TO_CHECK) {
      process.exit(0);
    }

    const message = {
      message: `Tool output detected (${estimatedTokens} tokens) from "${toolName || 'unknown'}". Consider running mcp__engram-ccode__check_redundancy to detect repeated identity context.`
    };

    process.stdout.write(JSON.stringify(message) + '\n');
  } catch {
    // Never crash — hook failures should be silent
    process.exit(0);
  }
}

main();
