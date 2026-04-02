import { requireConfig, resolveConfigPath } from "../config.js";
import { startShell } from "../shell/app.js";
import { closeStore, initializeStore } from "../store/index.js";

export interface ShellOptions {
  config?: string;
}

export async function handleShell(options: ShellOptions): Promise<void> {
  try {
    const config = await requireConfig(options.config);
    await initializeStore(config);

    await startShell({
      config,
      configPath: resolveConfigPath(options.config),
    });
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    process.exit(1);
  } finally {
    await closeStore();
  }
}
