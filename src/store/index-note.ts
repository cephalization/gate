import type { GateConfig } from "../types.js";
import { getStore } from "./index.js";

export async function indexVault(config: GateConfig): Promise<void> {
  const store = await getStore(config);
  await store.update({ collections: ["vault"] });
  await store.embed();
}

export async function reindexVault(config: GateConfig, force: boolean = false): Promise<void> {
  const store = await getStore(config);
  await store.update({ collections: ["vault"] });
  await store.embed({ force });
}

export async function indexSingleChange(config: GateConfig): Promise<void> {
  const store = await getStore(config);
  await store.update({ collections: ["vault"] });
  await store.embed();
}
