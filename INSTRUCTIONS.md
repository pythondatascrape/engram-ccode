# Installation & Usage Guide

## Prerequisites

- **Node.js 20+** — `node --version`
- **Claude Code** — installed and authenticated
- **npm** — for dependency installation

## Install

### 1. Clone the repository

```bash
git clone <repo-url> ~/Desktop/egcc
cd ~/Desktop/egcc
npm install
```

### 2. Register the plugin with Claude Code

Claude Code discovers plugins from `~/.claude/plugins/`. You can either symlink the repo or copy it:

**Option A — Symlink (recommended for development):**

```bash
mkdir -p ~/.claude/plugins
ln -s ~/Desktop/egcc ~/.claude/plugins/engram-ccode
```

**Option B — Copy:**

```bash
mkdir -p ~/.claude/plugins/engram-ccode
cp -r ~/Desktop/egcc/. ~/.claude/plugins/engram-ccode/
```

### 3. Restart Claude Code

Close and reopen Claude Code, or run `/restart` if available. The plugin loads at startup.

Verify the plugin is loaded — you should see `engram-ccode` MCP tools available and the `mcp__engram-ccode__*` tools listed.

---

## How It Works at Session Start

When you open Claude Code in a project directory, the `SessionStart` hook automatically:

1. Walks up the directory tree collecting `CLAUDE.md` files
2. Outputs a prompt instructing Claude to call `derive_codebook` with the content
3. Claude calls `compress_identity` to produce the compact `[identity]` block
4. The block is injected into session context — your project conventions are active

No action required from you.

---

## Per-Project Configuration

### Dimension Overrides (`.engram-codebook.yaml`)

Place this file in your project root to override or add dimensions:

```yaml
dimensions:
  lang:
    type: enum
    value: go
  session_state:
    type: enum
    value: ephemeral
  custom_rule:
    type: freeform
    value: no_interpreter_prompts
  suppress_this:
    type: enum
    value: null    # set to null to suppress a dimension
```

Run `/engram-ccode:codebook init` to scaffold this file from the current auto-derived state.

### Plugin Settings (`.engram/config.yaml`)

Run `/engram-ccode:config` to manage settings, or edit directly:

```yaml
redundancy_threshold: 10000     # tokens before notification
notify_on_redundancy: true      # surface notifications
auto_report_on_exit: false      # auto-generate report at session end
pricing:
  model: claude-sonnet-4-20250514
  input_per_1k: 0.003           # USD per 1k input tokens
```

---

## Skills (Slash Commands)

### `/engram-ccode:report`

Generate a markdown token savings report for the current session.

- Shows compression events, redundancy hits, and cumulative savings
- Optionally estimates cost savings based on your pricing config
- Saves to a file and appends a row to `.engram/savings-log.csv`

### `/engram-ccode:codebook`

Manage the active codebook:

| Subcommand | What It Does |
|-----------|-------------|
| (no args) | Show the current merged codebook dimensions |
| `diff` | Compare auto-derived vs. your YAML overrides |
| `init` | Bootstrap `.engram-codebook.yaml` from current state |
| `validate` | Check the YAML file for issues |

### `/engram-ccode:config`

Interactive settings manager. Shows current values and lets you update:

- Redundancy notification threshold
- Whether to notify on redundancy
- Auto-report on exit
- Pricing model and rate

---

## MCP Tools (Direct Use)

You can also call the tools directly in conversation:

```
Call mcp__engram-ccode__get_stats to see current session stats.
Call mcp__engram-ccode__derive_codebook with content="..." to re-derive the codebook.
Call mcp__engram-ccode__generate_report with name="March Session" to get a report.
```

---

## Savings Log

Each report appends a row to `.engram/savings-log.csv`:

```
timestamp,reportName,totalOriginalTokens,totalCompressedTokens,totalSaved,overallRatio,redundancyHits
2026-03-27T14:00:00.000Z,"March Session",1840,312,1528,0.8304,3
```

Review this file over time to track cumulative savings across sessions.

---

## Troubleshooting

**Plugin not loading:** Verify the symlink/copy path is exactly `~/.claude/plugins/engram-ccode/.claude-plugin/plugin.json`.

**No session-start compression:** The hook fires when `CLAUDE_PROJECT_DIR` is set (Claude Code sets this). Verify your project has a `CLAUDE.md` file.

**Codebook not detecting my conventions:** Run `/engram-ccode:codebook diff` to see what was auto-derived. Add any missed conventions to `.engram-codebook.yaml` as overrides.

**Stale codebook after editing CLAUDE.md:** The cache invalidates on SHA-256 content hash. Changing `CLAUDE.md` forces re-derivation on the next session start.
