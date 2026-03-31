import { requireConfig } from "../config.js";
import { reindexVault } from "../store/index-note.js";
import { formatDuration, formatTimingBreakdown } from "../timing.js";

export interface IndexOptions {
  full?: boolean;
  json?: boolean;
  config?: string;
}

export async function handleIndex(options: IndexOptions): Promise<void> {
  const startTime = Date.now();
  try {
    const config = await requireConfig(options.config);
    const reindexStart = Date.now();
    await reindexVault(config, Boolean(options.full));
    const timings = { reindex: Date.now() - reindexStart };
    const duration = formatDuration(startTime);

    if (options.json) {
      console.log(
        JSON.stringify({ success: true, full: Boolean(options.full), duration, timings }, null, 2),
      );
      return;
    }

    console.log(
      options.full ? "Re-indexed and re-embedded vault." : "Indexed updated vault content.",
    );
    console.log(`Duration: ${duration}`);
    console.log(`Timings: ${formatTimingBreakdown(timings)}`);
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
