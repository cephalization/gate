import * as p from "@clack/prompts";
import { runInitWizard } from "../ui/initWizard.js";
import { initializeStore } from "../store/index.js";
import { formatDuration, formatTimingBreakdown } from "../timing.js";

export interface InitOptions {
  json?: boolean;
}

export async function handleInit(options: InitOptions): Promise<void> {
  const startTime = Date.now();
  try {
    const wizardStart = Date.now();
    const result = await runInitWizard();
    if (!result) {
      return;
    }
    const timings: Record<string, number> = {
      wizard: Date.now() - wizardStart,
    };

    const spinner = p.spinner();
    spinner.start("Initializing QMD store...");
    let stageStart = Date.now();
    const store = await initializeStore(result.config);
    timings.init = Date.now() - stageStart;
    spinner.stop("Initialized QMD store");

    spinner.start("Indexing existing notes...");
    stageStart = Date.now();
    await store.update({ collections: ["vault"] });
    timings.update = Date.now() - stageStart;
    spinner.stop("Indexed existing notes");

    spinner.start("Generating embeddings (first run may download QMD models)...");
    stageStart = Date.now();
    await store.embed();
    timings.embed = Date.now() - stageStart;
    spinner.stop("Generated embeddings");

    const duration = formatDuration(startTime);

    p.outro(
      `Configuration saved to ${result.configPath}\nDuration: ${duration}\nTimings: ${formatTimingBreakdown(timings)}\n\nQuick start:\n  gate add "your first note"\n  gate related "search query"`,
    );

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            success: true,
            configPath: result.configPath,
            vaultPath: result.config.vaultPath,
            duration,
            timings,
          },
          null,
          2,
        ),
      );
    }
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
