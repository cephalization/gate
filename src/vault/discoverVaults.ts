import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { VaultCandidate } from "../types.js";

// Directories to skip during vault scanning
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".npm",
  ".cache",
  ".Trash",
  "Library",
  "Applications",
  ".local",
  ".nvm",
  ".pyenv",
  ".cargo",
  ".rustup",
  "go",
  ".docker",
]);

interface DiscoverOptions {
  maxDepth?: number;
  maxCandidates?: number;
  timeoutMs?: number;
}

const DEFAULT_OPTIONS: Required<DiscoverOptions> = {
  maxDepth: 5,
  maxCandidates: 20,
  timeoutMs: 5000,
};

/**
 * Scans from user home directory to find Obsidian vaults
 * (directories containing a .obsidian folder)
 */
export async function discoverVaults(options: DiscoverOptions = {}): Promise<VaultCandidate[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const homeDir = os.homedir();
  const candidates: VaultCandidate[] = [];
  const startTime = Date.now();

  async function scan(dir: string, depth: number): Promise<void> {
    // Check termination conditions
    if (depth > opts.maxDepth) return;
    if (candidates.length >= opts.maxCandidates) return;
    if (Date.now() - startTime > opts.timeoutMs) return;

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      // Check if this directory contains .obsidian
      const hasObsidian = entries.some((e) => e.isDirectory() && e.name === ".obsidian");

      if (hasObsidian) {
        candidates.push({
          path: dir,
          name: path.basename(dir),
        });
        // Don't scan inside a vault
        return;
      }

      // Recursively scan subdirectories
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith(".") && entry.name !== ".obsidian") continue;
        if (SKIP_DIRS.has(entry.name)) continue;

        await scan(path.join(dir, entry.name), depth + 1);

        // Re-check limits after each directory
        if (candidates.length >= opts.maxCandidates) return;
        if (Date.now() - startTime > opts.timeoutMs) return;
      }
    } catch {
      // Permission denied or other errors - skip this directory
    }
  }

  await scan(homeDir, 0);

  return candidates;
}

/**
 * Validates that a path is an Obsidian vault
 */
export async function isVault(vaultPath: string): Promise<boolean> {
  try {
    const obsidianPath = path.join(vaultPath, ".obsidian");
    const stat = await fs.stat(obsidianPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Creates the .obsidian directory to make a path a valid vault
 */
export async function initializeVault(vaultPath: string): Promise<void> {
  const obsidianPath = path.join(vaultPath, ".obsidian");
  await fs.mkdir(obsidianPath, { recursive: true });
}
