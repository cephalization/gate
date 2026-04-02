import { Command } from "commander";
import { handleAdd, type AddOptions } from "./commands/add.js";
import { handleInit, type InitOptions } from "./commands/init.js";
import { handleIngest, type IngestOptions } from "./commands/ingest.js";
import { handleIndex, type IndexOptions } from "./commands/index.js";
import { handleRelated, type RelatedOptions } from "./commands/related.js";
import { handleShell, type ShellOptions } from "./commands/shell.js";

export const ROOT_HELP_TEXT = `gate — fast Obsidian capture + retrieval

Usage:
  gate <command> [options]

Core commands:
  add, a <text>         Quick capture a note
  ingest --file <path>  Ingest a document into a note
  related <query>       Find related notes
  shell                 Start the interactive capture shell
  index                 Re-index the vault
  init                  Interactive setup wizard

Common flags:
  --json                Emit machine-readable output
  --config <path>       Use custom config file
  -h, --help            Show help
  -V, --version         Show version

Examples:
  gate add "meeting note: retry logic + invoice timeout"
  gate a "idea: webhook idempotency"
  gate ingest --file ./docs/postmortem.txt
  gate related "billing retries" --top 8
  gate shell
  gate index
`;

export function createProgram(): Command {
  const program = new Command();

  program.name("gate").description("gate — fast Obsidian capture + retrieval").version("0.1.0");

  program
    .command("add <text>")
    .alias("a")
    .description("Quick capture a note")
    .option("--edit", "Open note in editor after creation")
    .option("--json", "Emit machine-readable output")
    .option("--config <path>", "Use custom config file")
    .action(async (text: string, options: AddOptions) => {
      await handleAdd(text, options);
    });

  program
    .command("init")
    .description("Interactive setup wizard")
    .option("--json", "Emit machine-readable output")
    .action(async (options: InitOptions) => {
      await handleInit(options);
    });

  program
    .command("ingest")
    .description("Ingest a document into a note")
    .requiredOption("--file <path>", "Path to file to ingest")
    .option("--json", "Emit machine-readable output")
    .option("--config <path>", "Use custom config file")
    .action(async (options: IngestOptions) => {
      await handleIngest(options);
    });

  program
    .command("related <query>")
    .description("Find related notes")
    .option("--top <n>", "Number of results to return", parseInt)
    .option("--json", "Emit machine-readable output")
    .option("--config <path>", "Use custom config file")
    .action(async (query: string, options: RelatedOptions) => {
      await handleRelated(query, options);
    });

  program
    .command("shell")
    .description("Start the interactive capture shell")
    .option("--config <path>", "Use custom config file")
    .action(async (options: ShellOptions) => {
      await handleShell(options);
    });

  program
    .command("index")
    .description("Index or re-index the vault")
    .option("--full", "Force re-embed all notes")
    .option("--json", "Emit machine-readable output")
    .option("--config <path>", "Use custom config file")
    .action(async (options: IndexOptions) => {
      await handleIndex(options);
    });
  return program;
}
