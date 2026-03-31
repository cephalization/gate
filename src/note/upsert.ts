import * as fs from "node:fs/promises";
import type { AddOutcome, GateConfig } from "../types.js";
import { classifyCapture } from "../ai/classifyCapture.js";
import { createNote } from "./create.js";
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
  const timings: Record<string, number> = {};

  let stageStart = Date.now();
  const store = await getStore(config);
  await store.update({ collections: ["vault"] });
  timings.refresh = Date.now() - stageStart;

  stageStart = Date.now();
  const matches = await searchVault(config, text, { limit: 5, minScore: 0.3 });
  timings.search = Date.now() - stageStart;

  stageStart = Date.now();
  const mergeCandidates = (
    await Promise.all(
      matches.map(async (match) => ((await isMergeEligible(match.filePath)) ? match : null)),
    )
  ).filter((match): match is (typeof matches)[number] => match !== null);
  timings.filter = Date.now() - stageStart;
  const topMatch = mergeCandidates[0];

  if (topMatch && topMatch.score >= config.merge.autoThreshold) {
    stageStart = Date.now();
    const merged = await mergeIntoNote(config, topMatch, text);
    timings.write = Date.now() - stageStart;

    stageStart = Date.now();
    await indexSingleChange(config);
    timings.reindex = Date.now() - stageStart;
    return {
      success: true,
      action: "merged",
      title: merged.title,
      filePath: merged.filePath,
      noteId: merged.noteId,
      aiEnriched: merged.aiEnriched,
      mergedIntoTitle: merged.title,
      timings,
    };
  }

  if (topMatch && topMatch.score >= config.merge.suggestThreshold) {
    stageStart = Date.now();
    const decision = await classifyCapture(config, text, topMatch);
    timings.classify = Date.now() - stageStart;
    if (decision.decision === "merge") {
      stageStart = Date.now();
      const merged = await mergeIntoNote(config, topMatch, text);
      timings.write = Date.now() - stageStart;

      stageStart = Date.now();
      await indexSingleChange(config);
      timings.reindex = Date.now() - stageStart;
      return {
        success: true,
        action: "merged",
        title: merged.title,
        filePath: merged.filePath,
        noteId: merged.noteId,
        aiEnriched: merged.aiEnriched,
        mergedIntoTitle: merged.title,
        timings,
      };
    }
  }

  stageStart = Date.now();
  const created = await createNote(config, text, source, matches);
  timings.write = Date.now() - stageStart;

  stageStart = Date.now();
  await indexSingleChange(config);
  timings.reindex = Date.now() - stageStart;
  return {
    success: true,
    action: "created",
    title: created.title,
    filePath: created.filePath,
    noteId: created.noteId,
    aiEnriched: created.aiEnriched,
    related: created.related,
    timings,
  };
}
