# gate – Obsidian Note Organizer CLI (Design v2)

## Product Direction

`gate` is a **fast capture + retrieval** CLI for Obsidian vaults, built for rapid personal note flow.

Primary goals:

1. Capture notes with near-zero friction.
2. Ingest longer documents when needed.
3. Retrieve related notes from natural-language queries.
4. Enrich notes with LLM-generated structured metadata via AI SDK.
5. Make setup easy with an interactive `init` wizard.

## Core UX Principle: Speed First

Quick capture is the default interaction:

```bash
gate add "meeting note: retry logic + invoice timeout"
gate a "possible postmortem topic: webhook idempotency"
```

Where:

- `add` is explicit.
- `a` is a short alias optimized for rapid note entry.

## Bare Command Experience (`gate`)

Running `gate` with no subcommand should print concise help for both human and LLM orientation.

### Help goals

- Human-readable in a terminal (short, obvious next actions).
- Machine-parseable enough for agentic use (clear command taxonomy, stable option names).

### Example output shape

```text
gate — fast Obsidian capture + retrieval

Usage:
  gate <command> [options]

Core commands:
  add, a <text>         Quick capture a note
  ingest --file <path>  Ingest a document into a note
  related <query>       Find related notes
  init                  Interactive setup wizard

Common flags:
  --json                Emit machine-readable output
  --config <path>       Use custom config file
  -h, --help            Show help
```

## CLI Surface (MVP)

```bash
# Fast note capture
gate add "cache invalidation issue in billing pipeline"
gate a "idea: retries should include jitter"

# Ingest file/document
gate ingest --file ./docs/postmortem.txt

# Retrieve semantically related notes
gate related "how do billing retries and webhook delays connect?" --top 8

# Optional machine output
gate related "idempotency keys" --json

# First-time interactive setup
gate init
```

## Interactive Setup: `gate init` (Bombshell Clack)

`gate init` should launch an interactive prompt wizard using the Bombshell Clack package.

### Wizard responsibilities

1. Pick or create config path (`~/.config/gate/config.json` default).
2. Select LLM provider/model (AI SDK compatible).
3. Set Obsidian vault path.
4. Configure retrieval defaults (`topK`, rank weights).
5. Enable/disable QMD integration.
6. Write validated config file and print quick-start commands.

### Prompt flow (proposed)

1. Welcome + short explanation.
2. Detect vault candidates (optional scan, see below).
3. Choose vault from list or enter manually.
4. Choose AI provider/model.
5. Optional API key/env guidance.
6. QMD enabled? if yes: endpoint + collection.
7. Confirm summary and write config.

## Vault Auto-Detection Viability

A home-directory scan for `.obsidian` folders is viable and useful during `init`.

### Proposed detection strategy

- Scan from user home directory with guardrails:
  - bounded depth (e.g., max 4–6 levels)
  - skip heavy/system dirs (`Library`, `node_modules`, `.git`, cache dirs)
  - hard cap on discovered candidates
  - timeout fallback to manual entry
- A folder containing `.obsidian/` is treated as a candidate vault root.
- Present candidates in a selectable list, with a “manual path entry” fallback.

### UX notes

- Scanning should be opt-in or skippable if it takes too long.
- Always allow manual path override.
- Persist last successful vault for faster future init/reset.

## Ingestion with AI SDK Structured Outputs

During `add` / `ingest`, `gate` may call a configurable LLM through AI SDK to produce structured metadata.

### Structured Output Contract (example)

```ts
type IngestMetadata = {
  title: string;
  summary: string;
  topics: string[];
  entities: string[];
  noteType: "idea" | "meeting" | "postmortem" | "reference" | "task";
  confidence: number; // 0..1
  suggestedLinks: string[]; // candidate existing note titles
};
```

### Behavior

- If AI extraction succeeds: write enriched frontmatter + clean body.
- If AI extraction fails/unavailable: fall back to deterministic parsing and still write note.
- Always preserve raw user text in note body for traceability.

## Suggested Note Schema

```yaml
---
id: 2026-03-28T12-34-56Z
created: 2026-03-28
updated: 2026-03-28
source: gate-add
noteType: idea
topics: [billing, retries]
entities: [invoice, webhook]
confidence: 0.82
---
```

Body sections:

- `## Summary`
- `## Raw Capture`
- `## Related`

## Architecture (TypeScript)

- `src/commands/add.ts` (supports `add` and alias `a`)
- `src/commands/init.ts` (interactive setup wizard)
- `src/commands/ingest.ts`
- `src/commands/related.ts`
- `src/ui/initWizard.ts` (Bombshell Clack prompt orchestration)
- `src/vault/discoverVaults.ts` (candidate scan for `.obsidian`)
- `src/obsidianCli.ts` (wrapper over Obsidian CLI operations)
- `src/ai/extractMetadata.ts` (AI SDK integration + schema validation)
- `src/retrieval/qmdAdapter.ts`
- `src/normalize.ts`
- `src/types.ts`

## Obsidian CLI Integration

Use Obsidian CLI for vault-facing operations only (create/update/open/search where supported), while `gate` owns normalization and enrichment.

Implementation guidance:

- Centralize command execution in `obsidianCli.ts`.
- Capability-detect commands at startup from `obsidian --help`.
- Keep an adapter boundary so Obsidian CLI command changes are isolated.

## Retrieval Strategy

`related <query>` can combine:

- Semantic ranking (QMD)
- Lexical ranking (local fallback)

Rank fusion baseline:

- `finalScore = 0.7 * semanticScore + 0.3 * lexicalScore`

Output should include:

- title
- score
- short why-match rationale
- file path

## Config Proposal

`gate.config.json`

```json
{
  "vaultPath": "/Users/you/Documents/ObsidianVault",
  "defaultFolder": "Inbox",
  "obsidianCli": {
    "binary": "obsidian"
  },
  "ai": {
    "enabled": true,
    "provider": "openai",
    "model": "gpt-4.1-mini",
    "temperature": 0.1,
    "maxTokens": 600
  },
  "qmd": {
    "enabled": true,
    "endpoint": "http://localhost:3000",
    "collection": "obsidian-notes"
  },
  "retrieval": {
    "topK": 8,
    "semanticWeight": 0.7,
    "lexicalWeight": 0.3
  }
}
```

## MVP (Weekend Scope)

1. `gate add|a <text>` fast path.
2. `gate` bare command concise help output.
3. `gate init` interactive wizard with vault selection.
4. `gate ingest --file <path>`.
5. `gate related <query> --top N`.
6. AI SDK metadata extraction (optional + configurable).
7. Safe fallback path when AI/QMD are unavailable.

## Early Decisions to Lock

1. Should `gate add` be fire-and-forget by default, with optional `--edit`?
2. Should AI enrichment run sync (simpler) or async background (faster perceived latency)?
3. Should vault scanning be opt-in by default, or automatic with timeout?
