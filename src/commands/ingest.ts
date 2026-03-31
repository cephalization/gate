import * as fs from "node:fs/promises";
import * as path from "node:path";
import { requireConfig } from "../config.js";
import { captureNote } from "../note/upsert.js";
import { formatDuration, formatTimingBreakdown } from "../timing.js";
import type { AddOutcome } from "../types.js";

export interface IngestOptions {
  file: string;
  json?: boolean;
  config?: string;
}

export type IngestResult = AddOutcome & {
  sourceFile: string;
};

export async function ingestFile(options: IngestOptions): Promise<IngestResult> {
  const config = await requireConfig(options.config);
  const sourceFile = path.resolve(options.file);
  let content: string;

  try {
    content = await fs.readFile(sourceFile, "utf-8");
  } catch {
    throw new Error(`Cannot read file: ${sourceFile}`);
  }

  const result = await captureNote(config, content, `gate-ingest:${path.basename(sourceFile)}`);
  return { ...result, sourceFile };
}

export async function handleIngest(options: IngestOptions): Promise<void> {
  const startTime = Date.now();
  try {
    const result = await ingestFile(options);
    const duration = formatDuration(startTime);

    if (options.json) {
      console.log(JSON.stringify({ ...result, duration }, null, 2));
      return;
    }

    const enriched = result.aiEnriched ? " (AI enriched)" : "";
    if (result.action === "merged") {
      console.log(`Merged into: ${result.mergedIntoTitle}${enriched}`);
    } else {
      console.log(`Created: ${result.title}${enriched}`);
    }
    console.log(`  From: ${result.sourceFile}`);
    console.log(`  To: ${result.filePath}`);
    console.log(`  Duration: ${duration}`);
    console.log(`  Timings: ${formatTimingBreakdown(result.timings)}`);
  } catch (error) {
    if (options.json) {
      console.log(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        }),
      );
    } else {
      console.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
    process.exit(1);
  }
}
