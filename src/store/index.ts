import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createStore, type QMDStore } from "@tobilu/qmd";
import type { GateConfig } from "../types.js";
import { getGateDataDir, getQmdDbPath } from "../config.js";

let cachedStore: QMDStore | null = null;
let cachedVaultPath: string | null = null;

export async function getStore(config: GateConfig): Promise<QMDStore> {
  if (cachedStore && cachedVaultPath === config.vaultPath) {
    return cachedStore;
  }

  if (cachedStore) {
    await cachedStore.close();
  }

  const gateDir = getGateDataDir(config.vaultPath);
  await fs.mkdir(gateDir, { recursive: true });

  cachedStore = await createStore({
    dbPath: getQmdDbPath(config.vaultPath),
    config: {
      collections: {
        vault: {
          path: config.vaultPath,
          pattern: "**/*.md",
          ignore: [".gate/**", ".obsidian/**"],
        },
      },
    },
  });
  cachedVaultPath = config.vaultPath;

  return cachedStore;
}

export async function initializeStore(config: GateConfig): Promise<QMDStore> {
  return getStore(config);
}

export async function closeStore(): Promise<void> {
  if (cachedStore) {
    await cachedStore.close();
    cachedStore = null;
    cachedVaultPath = null;
  }
}

export function toVaultRelativePath(vaultPath: string, filePath: string): string {
  return path.relative(vaultPath, filePath).replace(/\\/g, "/");
}
