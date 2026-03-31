import * as p from "@clack/prompts";
import * as path from "node:path";
import { getConfigPath, saveConfig } from "../config.js";
import type { GateConfig, VaultCandidate } from "../types.js";
import { discoverVaults, isVault } from "../vault/discoverVaults.js";

const AI_PROVIDERS = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "google", label: "Google (Gemini)" },
] as const;

const AI_MODELS: Record<string, { value: string; label: string }[]> = {
  openai: [
    { value: "gpt-4.1-mini", label: "GPT-4.1 Mini (Recommended)" },
    { value: "gpt-4.1", label: "GPT-4.1" },
    { value: "gpt-4o", label: "GPT-4o" },
  ],
  anthropic: [
    { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4 (Recommended)" },
    { value: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku" },
  ],
  google: [
    { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash (Recommended)" },
    { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
  ],
};

export interface WizardResult {
  config: GateConfig;
  configPath: string;
}

async function promptForVaultPath(): Promise<string | null> {
  while (true) {
    const manualPath = await p.text({
      message: "Enter the path to your Obsidian vault:",
      placeholder: "/path/to/your/vault",
      validate: (value: string) => (!value ? "Path is required" : undefined),
    });

    if (p.isCancel(manualPath)) {
      p.cancel("Setup cancelled");
      return null;
    }

    const resolved = path.resolve(manualPath);
    if (await isVault(resolved)) {
      return resolved;
    }

    p.log.warning("Path does not appear to be an Obsidian vault (no .obsidian folder).");
  }
}

export async function runInitWizard(): Promise<WizardResult | null> {
  p.intro("gate — Obsidian Note Organizer Setup");

  const scanSpinner = p.spinner();
  scanSpinner.start("Scanning for Obsidian vaults...");

  let vaultCandidates: VaultCandidate[] = [];
  try {
    vaultCandidates = await discoverVaults({ timeoutMs: 5000 });
    scanSpinner.stop(
      vaultCandidates.length > 0
        ? `Found ${vaultCandidates.length} vault(s)`
        : "No vaults found automatically",
    );
  } catch {
    scanSpinner.stop("Vault scan failed, continuing with manual entry");
  }

  let vaultPath: string;
  if (vaultCandidates.length > 0) {
    const selectedVault = await p.select({
      message: "Select your Obsidian vault:",
      options: [
        ...vaultCandidates.map((vault) => ({
          value: vault.path,
          label: vault.name,
          hint: vault.path,
        })),
        { value: "__manual__", label: "Enter path manually" },
      ],
    });

    if (p.isCancel(selectedVault)) {
      p.cancel("Setup cancelled");
      return null;
    }

    if (selectedVault === "__manual__") {
      const result = await promptForVaultPath();
      if (!result) return null;
      vaultPath = result;
    } else {
      vaultPath = selectedVault;
    }
  } else {
    const result = await promptForVaultPath();
    if (!result) return null;
    vaultPath = result;
  }

  const defaultFolder = await p.text({
    message: "Default folder for new notes:",
    initialValue: "Inbox",
    placeholder: "Inbox",
  });
  if (p.isCancel(defaultFolder)) {
    p.cancel("Setup cancelled");
    return null;
  }

  const enableAI = await p.confirm({
    message: "Enable AI-powered note enrichment?",
    initialValue: true,
  });
  if (p.isCancel(enableAI)) {
    p.cancel("Setup cancelled");
    return null;
  }

  let ai: GateConfig["ai"] = {
    enabled: false,
    provider: "openai",
    model: "gpt-4.1-mini",
    temperature: 0.1,
    maxTokens: 600,
  };

  if (enableAI) {
    const provider = await p.select({
      message: "Select AI provider:",
      options: AI_PROVIDERS.map((provider) => ({ value: provider.value, label: provider.label })),
    });
    if (p.isCancel(provider)) {
      p.cancel("Setup cancelled");
      return null;
    }

    const providerKey = provider as string;
    const model = await p.select({
      message: "Select AI model:",
      options: AI_MODELS[providerKey] ?? AI_MODELS.openai,
    });
    if (p.isCancel(model)) {
      p.cancel("Setup cancelled");
      return null;
    }

    ai = {
      enabled: true,
      provider: providerKey,
      model,
      temperature: 0.1,
      maxTokens: 600,
    };

    const envVar =
      providerKey === "openai"
        ? "OPENAI_API_KEY"
        : providerKey === "anthropic"
          ? "ANTHROPIC_API_KEY"
          : "GOOGLE_GENERATIVE_AI_API_KEY";
    p.note(`Set ${envVar} before using AI features.`, "API Key Setup");
  }

  p.note(
    "QMD is required and will download local models on first indexing (~2GB). gate will show progress during setup.",
    "QMD Requirement",
  );

  const config: GateConfig = {
    vaultPath,
    defaultFolder: defaultFolder || "Inbox",
    ai,
    merge: {
      autoThreshold: 0.85,
      suggestThreshold: 0.7,
    },
  };

  p.note(
    [
      `Vault: ${config.vaultPath}`,
      `Default folder: ${config.defaultFolder}`,
      `AI: ${config.ai.enabled ? `${config.ai.provider}/${config.ai.model}` : "disabled"}`,
    ].join("\n"),
    "Configuration Summary",
  );

  const confirmSave = await p.confirm({ message: "Save this configuration?", initialValue: true });
  if (p.isCancel(confirmSave) || !confirmSave) {
    p.cancel("Setup cancelled");
    return null;
  }

  const configPath = getConfigPath();
  await saveConfig(config);
  return { config, configPath };
}
