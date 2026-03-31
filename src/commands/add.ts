import { requireConfig } from "../config.js";
import { captureNote } from "../note/upsert.js";
import { formatDuration, formatTimingBreakdown } from "../timing.js";
import type { AddOutcome } from "../types.js";

export interface AddOptions {
  edit?: boolean;
  json?: boolean;
  config?: string;
}

export async function addNote(text: string, options: AddOptions = {}): Promise<AddOutcome> {
  const config = await requireConfig(options.config);
  return captureNote(config, text, "gate-add");
}

export async function handleAdd(text: string, options: AddOptions): Promise<void> {
  const startTime = Date.now();
  try {
    const result = await addNote(text, options);
    const duration = formatDuration(startTime);

    if (options.json) {
      console.log(JSON.stringify({ ...result, duration }, null, 2));
      return;
    }

    const enriched = result.aiEnriched ? " (AI enriched)" : "";
    if (result.action === "merged") {
      console.log(`Merged into: ${result.mergedIntoTitle}${enriched}`);
      console.log(`  ${result.filePath}`);
      console.log(`  Duration: ${duration}`);
      console.log(`  Timings: ${formatTimingBreakdown(result.timings)}`);
      return;
    }

    console.log(`Created: ${result.title}${enriched}`);
    console.log(`  ${result.filePath}`);
    if (result.related.length > 0) {
      console.log(`  Related: ${result.related.join(", ")}`);
    }
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
