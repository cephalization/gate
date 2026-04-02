import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { GateConfig, GateConfigSchema } from "./types.js";

const CONFIG_DIR = path.join(os.homedir(), ".config", "gate");
const CONFIG_FILE = "config.json";

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function getConfigPath(): string {
  return path.join(CONFIG_DIR, CONFIG_FILE);
}

export function resolveConfigPath(customPath?: string): string {
  return customPath ?? getConfigPath();
}

export function getGateDataDir(vaultPath: string): string {
  return path.join(vaultPath, ".gate");
}

export function getQmdDbPath(vaultPath: string): string {
  return path.join(getGateDataDir(vaultPath), "qmd.sqlite");
}

export async function configExists(): Promise<boolean> {
  try {
    await fs.access(getConfigPath());
    return true;
  } catch {
    return false;
  }
}

export async function loadConfig(customPath?: string): Promise<GateConfig | null> {
  const configPath = resolveConfigPath(customPath);

  try {
    const content = await fs.readFile(configPath, "utf-8");
    const parsed = JSON.parse(content);
    const validated = GateConfigSchema.parse(parsed);
    return validated;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function saveConfig(config: GateConfig, customPath?: string): Promise<void> {
  const configPath = resolveConfigPath(customPath);
  const configDir = path.dirname(configPath);

  // Ensure config directory exists
  await fs.mkdir(configDir, { recursive: true });

  // Validate before saving
  const validated = GateConfigSchema.parse(config);

  await fs.writeFile(configPath, JSON.stringify(validated, null, 2), "utf-8");
}

export async function requireConfig(customPath?: string): Promise<GateConfig> {
  const config = await loadConfig(customPath);

  if (!config) {
    throw new Error("No configuration found. Run `gate init` to set up your vault.");
  }

  return config;
}
