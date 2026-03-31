# gate

Fast Obsidian capture with automatic semantic filing.

`gate` uses the QMD SDK locally from the start. Every capture is checked against your vault, then either:

- creates a new note with real related-note links, or
- merges into an existing note when the capture is clearly an addition

## Install

```bash
vp install
vp pack
vp run link
```

Then run:

```bash
gate init
```

`gate init` warns before QMD downloads local models on first indexing.

## Usage

```bash
# quick capture
gate add "meeting note: retry logic + invoice timeout"
gate a "idea: webhook idempotency"

# ingest a longer document
gate ingest --file ./notes/postmortem.txt

# search the vault semantically
gate related "billing retries" --top 8

# manually refresh the QMD index
gate index
gate index --full
```

All commands support `--json`. Most commands also support `--config <path>`.

## How It Works

For every capture, `gate`:

1. searches your vault with QMD
2. auto-merges when the top match is very strong
3. asks the configured LLM to classify ambiguous matches
4. otherwise creates a new note
5. re-indexes the vault so the next capture can find the latest note state

Merged notes append timestamped raw captures and regenerate summary/metadata from the combined note content.

## Development

```bash
# auto-rebuild on source changes
vp run dev

# build once
vp pack

# format, lint, and check
vp check

# fix formatting issues
vp check --fix
```

Because `vp run link` links the built binary, source edits take effect after rebuilds.

## Project Structure

```text
src/
├── cli.ts
├── config.ts
├── types.ts
├── normalize.ts
├── ai/
│   ├── classifyCapture.ts
│   └── extractMetadata.ts
├── commands/
│   ├── add.ts
│   ├── index.ts
│   ├── ingest.ts
│   ├── init.ts
│   └── related.ts
├── note/
│   ├── create.ts
│   ├── format.ts
│   ├── merge.ts
│   └── upsert.ts
├── store/
│   ├── index-note.ts
│   ├── index.ts
│   └── search.ts
├── ui/
│   └── initWizard.ts
└── vault/
    └── discoverVaults.ts
```

## Configuration

Config lives at `~/.config/gate/config.json`:

```json
{
  "vaultPath": "/path/to/vault",
  "defaultFolder": "Inbox",
  "ai": {
    "enabled": true,
    "provider": "openai",
    "model": "gpt-4.1-mini",
    "temperature": 0.1,
    "maxTokens": 600
  },
  "merge": {
    "autoThreshold": 0.85,
    "suggestThreshold": 0.7
  }
}
```

QMD data is stored inside the vault at `.gate/qmd.sqlite`.

## Notes

- `vp build` is for web apps; this project is a CLI, so use `vp pack`
- first-time embedding may take a while because QMD downloads local models
- `gate` stays quiet during indexing except for setup

## License

MIT
