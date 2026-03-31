import { requireConfig } from "../config.js";
import { formatDuration, formatTimingBreakdown } from "../timing.js";
import type { RelatedNoteResult } from "../types.js";
import { matchesToRelatedResults, searchVault } from "../store/search.js";

export interface RelatedOptions {
  top?: number;
  json?: boolean;
  config?: string;
}

export async function findRelated(
  query: string,
  options: RelatedOptions = {},
): Promise<RelatedNoteResult[]> {
  const config = await requireConfig(options.config);
  const matches = await searchVault(config, query, {
    limit: options.top ?? 8,
    minScore: 0.2,
  });
  return matchesToRelatedResults(matches);
}

export async function handleRelated(query: string, options: RelatedOptions): Promise<void> {
  const startTime = Date.now();
  try {
    const searchStart = Date.now();
    const results = await findRelated(query, options);
    const timings = { search: Date.now() - searchStart };
    const duration = formatDuration(startTime);

    if (options.json) {
      console.log(JSON.stringify({ results, duration, timings }, null, 2));
      return;
    }

    if (results.length === 0) {
      console.log("No related notes found.");
      console.log(`Duration: ${duration}`);
      console.log(`Timings: ${formatTimingBreakdown(timings)}`);
      return;
    }

    console.log(`Found ${results.length} related note(s):\n`);
    for (const result of results) {
      console.log(`  ${result.title}`);
      console.log(`    Score: ${(result.score * 100).toFixed(1)}% — ${result.rationale}`);
      console.log(`    ${result.filePath}`);
      console.log();
    }
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
