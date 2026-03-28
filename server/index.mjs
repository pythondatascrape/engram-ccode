/**
 * index.mjs — MCP server entry point for engram-ccode.
 *
 * Creates a stdio-based MCP server that exposes 5 tools for identity-aware
 * context compression: derive_codebook, compress_identity, check_redundancy,
 * get_stats, and generate_report.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { deriveDimensions } from './compression/deriver.mjs';
import {
  createCodebook,
  loadYamlOverrides,
  mergeCodebook,
} from './compression/codebook.mjs';
import { serialize, formatBlock } from './compression/serializer.mjs';
import { createDetector } from './redundancy/detector.mjs';
import { createLedger } from './tracking/ledger.mjs';
import {
  formatReport,
  formatSummaryLine,
  formatCsvRow,
  appendToSavingsLog,
} from './reporting/formatter.mjs';

// ---------------------------------------------------------------------------
// Session state (module-level)
// ---------------------------------------------------------------------------

let activeCodebook = null;
let activeDetector = null;
const ledger = createLedger();

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: 'derive_codebook',
    description:
      'Derive a codebook from CLAUDE.md content. Extracts structured identity dimensions via pattern matching.',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The CLAUDE.md text content to derive dimensions from.',
        },
        yamlOverridePath: {
          type: 'string',
          description:
            'Optional path to .engram-codebook.yaml for manual overrides.',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'compress_identity',
    description:
      'Compress identity dimensions into compact key=value format.',
    inputSchema: {
      type: 'object',
      properties: {
        dimensions: {
          type: 'object',
          description:
            'Dimension key/value map to compress. If not provided, uses active codebook dimensions.',
        },
      },
    },
  },
  {
    name: 'check_redundancy',
    description:
      'Check content for redundant identity reinforcement against the active codebook.',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The content to check for redundant identity mentions.',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'get_stats',
    description: 'Get current session token accounting statistics.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'generate_report',
    description: 'Generate a markdown token savings report.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Report name / title.',
        },
        description: {
          type: 'string',
          description: 'Report description.',
        },
        savingsLogPath: {
          type: 'string',
          description:
            'Path to a CSV savings log file. If provided, a row is appended.',
        },
        pricing: {
          type: 'object',
          description:
            'Pricing info for cost estimation: { model: string, inputPer1k: number }.',
          properties: {
            model: { type: 'string' },
            inputPer1k: { type: 'number' },
          },
        },
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

/**
 * @param {string} name
 * @param {object} args
 * @returns {Promise<{ content: Array<{type: string, text: string}>, isError?: boolean }>}
 */
async function handleToolCall(name, args) {
  switch (name) {
    case 'derive_codebook':
      return handleDeriveCodebook(args);
    case 'compress_identity':
      return handleCompressIdentity(args);
    case 'check_redundancy':
      return handleCheckRedundancy(args);
    case 'get_stats':
      return handleGetStats();
    case 'generate_report':
      return handleGenerateReport(args);
    default:
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      };
  }
}

async function handleDeriveCodebook(args) {
  const { content, yamlOverridePath } = args ?? {};

  if (!content || typeof content !== 'string') {
    return {
      content: [
        { type: 'text', text: 'Error: "content" (string) is required.' },
      ],
      isError: true,
    };
  }

  let dimensions = deriveDimensions(content);

  if (yamlOverridePath) {
    const overrides = await loadYamlOverrides(yamlOverridePath);
    if (overrides) {
      dimensions = mergeCodebook(dimensions, overrides);
    }
  }

  activeCodebook = createCodebook(dimensions);

  if (activeDetector) {
    activeDetector.updateCodebook(activeCodebook);
  } else {
    activeDetector = createDetector(activeCodebook);
  }

  return {
    content: [
      { type: 'text', text: JSON.stringify(activeCodebook, null, 2) },
    ],
  };
}

async function handleCompressIdentity(args) {
  const { dimensions: providedDimensions } = args ?? {};

  // Use provided dimensions or fall back to active codebook
  const dimensions =
    providedDimensions ??
    (activeCodebook ? activeCodebook.dimensions : null);

  if (!dimensions || Object.keys(dimensions).length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: 'Error: No dimensions provided and no active codebook. Run derive_codebook first or provide dimensions.',
        },
      ],
      isError: true,
    };
  }

  const serialized = serialize(dimensions);
  const block = formatBlock(serialized);
  const originalText = JSON.stringify(dimensions);
  const stats = ledger.recordCompression(originalText, block);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ serialized, block, stats }, null, 2),
      },
    ],
  };
}

async function handleCheckRedundancy(args) {
  const { content } = args ?? {};

  if (!content || typeof content !== 'string') {
    return {
      content: [
        { type: 'text', text: 'Error: "content" (string) is required.' },
      ],
      isError: true,
    };
  }

  // If no active detector, return early
  if (!activeDetector) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            redundant: false,
            message: 'No codebook active',
          }),
        },
      ],
    };
  }

  // Check for redundancy
  const result = activeDetector.check(content);

  // Record if redundant
  if (result.redundant) {
    ledger.recordRedundancy(result.matches, result.tokens);
  }

  // Check notification threshold
  const notify = ledger.shouldNotify();

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            redundant: result.redundant,
            matches: result.matches,
            tokens: result.tokens,
            shouldNotify: notify,
          },
          null,
          2,
        ),
      },
    ],
  };
}

async function handleGetStats() {
  const stats = ledger.getStats();
  return {
    content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }],
  };
}

async function handleGenerateReport(args) {
  const { name, description, savingsLogPath, pricing } = args ?? {};

  // 1. Get stats
  const stats = ledger.getStats();

  // 2. Format report
  const report = formatReport(stats, {
    name,
    description,
    codebook: activeCodebook?.dimensions,
    pricing,
  });

  // 3. Append to savings log if path provided
  if (savingsLogPath) {
    try {
      const csvRow = formatCsvRow(stats, name);
      appendToSavingsLog(savingsLogPath, csvRow);
    } catch (err) {
      // Non-fatal: log append failure does not break the report
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                report,
                summary: formatSummaryLine(stats),
                warning: `Failed to append to savings log: ${err.message}`,
              },
              null,
              2,
            ),
          },
        ],
      };
    }
  }

  // 4. Return report and summary
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            report,
            summary: formatSummaryLine(stats),
          },
          null,
          2,
        ),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const server = new Server(
  { name: 'engram-ccode', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

// Register tools/list handler
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

// Register tools/call handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    return await handleToolCall(name, args);
  } catch (err) {
    return {
      content: [
        {
          type: 'text',
          text: `Error in tool "${name}": ${err.message ?? String(err)}`,
        },
      ],
      isError: true,
    };
  }
});

// ---------------------------------------------------------------------------
// Start the server
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
