import * as fs from "node:fs/promises";
import type { AddOutcome, GateConfig } from "../types.js";
import { classifyCapture } from "../ai/classifyCapture.js";
import { createNote } from "./create.js";
import { runCapturePipeline, type CaptureHooks } from "./capture-pipeline.js";
import { parseNote } from "./format.js";
import { mergeIntoNote } from "./merge.js";
import { searchVault } from "../store/search.js";
import { indexSingleChange } from "../store/index-note.js";
import { getStore } from "../store/index.js";

async function isMergeEligible(filePath: string): Promise<boolean> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const note = parseNote(content);
    return (
      typeof note.frontmatter.source === "string" && note.frontmatter.source.startsWith("gate-")
    );
  } catch {
    return false;
  }
}

export async function captureNote(
  config: GateConfig,
  text: string,
  source: string,
): Promise<AddOutcome> {
  return captureNoteWithHooks(config, text, source);
}

export async function captureNoteWithHooks(
  config: GateConfig,
  text: string,
  source: string,
  hooks: CaptureHooks = {},
): Promise<AddOutcome> {
  return runCapturePipeline(
    config,
    text,
    source,
    {
      refreshStore: async () => {
        const store = await getStore(config);
        await store.update({ collections: ["vault"] });
      },
      searchVault: async (query) => searchVault(config, query, { limit: 5, minScore: 0.3 }),
      isMergeEligible,
      classifyCapture: async (capture, match) => classifyCapture(config, capture, match),
      createNote: async (capture, captureSource, matches) =>
        createNote(config, capture, captureSource, matches),
      mergeIntoNote: async (match, capture) => mergeIntoNote(config, match, capture),
      reindex: async () => indexSingleChange(config),
    },
    hooks,
  );
}
