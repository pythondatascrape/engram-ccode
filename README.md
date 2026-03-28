# engram-ccode

A [Claude Code](https://claude.ai/code) plugin that adapts [Engram's](https://github.com/emeyer) identity-aware compression to reduce context window token usage in coding sessions.

## What It Does

Every Claude Code session re-reads the same `CLAUDE.md` files describing your project's conventions. `engram-ccode` compresses that project identity into a compact `key=value` format at session start — typically reducing 150–200 tokens of prose to 30–40 tokens — and monitors for redundant identity reinforcement throughout the session.

**Example compression:**

```
# CLAUDE.md prose (~187 tokens):
"This is a Go server using structured logging with slog.
Error handling returns errors wrapped with fmt.Errorf.
Every public function takes context.Context as first param.
Tests are table-driven using testify..."

# Compressed (~34 tokens):
[identity]
arch=modular_monolith concurrency=errgroup_ctx_cancel err_style=wrap_errorf
lang=go logging=slog pkg_style=no_circular testing=table_driven_testify
[/identity]
```

## Architecture

Three components work together:

| Component | What It Does |
|-----------|-------------|
| **MCP Server** (`server/index.mjs`) | stdio-based server exposing 5 compression tools |
| **Hooks** (`hooks/`) | `SessionStart` compresses identity; `PostToolUse` detects redundancy |
| **Skills** (`skills/`) | `/report`, `/codebook`, `/config` slash commands |

### MCP Tools

| Tool | Purpose |
|------|---------|
| `derive_codebook` | Extract structured dimensions from CLAUDE.md via pattern matching |
| `compress_identity` | Serialize dimensions to deterministic `key=value` format |
| `check_redundancy` | Compare tool output against active codebook |
| `get_stats` | Return session token accounting |
| `generate_report` | Produce markdown savings report |

### Detected Dimensions

Auto-derived from `CLAUDE.md` without LLM calls:

`lang` · `framework` · `build` · `testing` · `err_style` · `logging` · `arch` · `concurrency` · `transport` · `pkg_style`

Override any dimension via `.engram-codebook.yaml` in your project root.

## Skills

| Skill | Description |
|-------|-------------|
| `/engram-ccode:report` | Generate a token savings report for the session |
| `/engram-ccode:codebook` | Show, diff, init, or validate the active codebook |
| `/engram-ccode:config` | Manage redundancy threshold, pricing, and notification settings |

## Per-Project Files

```
<project-root>/
├── .engram-codebook.yaml     # optional dimension overrides
└── .engram/
    ├── codebook-cache.json   # SHA-256-invalidated codebook cache
    ├── config.yaml           # plugin settings
    └── savings-log.csv       # cross-session savings history
```

## Design Constraints

- **No LLM calls** during compression — pure pattern matching
- **Never modifies tool output** — PostToolUse hook is passive/observational only
- **Local only** — no network calls, no telemetry
- **Deterministic** — same CLAUDE.md always produces same codebook

## Requirements

- Node.js 20+
- Claude Code with plugin support

## Installation

See [INSTRUCTIONS.md](./INSTRUCTIONS.md).

## License

MIT © 2026 Erik Meyer
