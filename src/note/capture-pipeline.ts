import type { CaptureDecision, GateConfig, QmdMatch, AddOutcome } from "../types.js";

export type CaptureStage = "refresh" | "search" | "filter" | "classify" | "write" | "reindex";

export interface CaptureHooks {
  onStageChange?: (stage: CaptureStage) => void | Promise<void>;
  onTiming?: (stage: CaptureStage, durationMs: number) => void | Promise<void>;
}

export interface CreateCaptureResult {
  title: string;
  noteId: string;
  filePath: string;
  aiEnriched: boolean;
  related: string[];
}

export interface MergeCaptureResult {
  title: string;
  noteId: string;
  filePath: string;
  aiEnriched: boolean;
}

export interface CapturePipelineDependencies {
  refreshStore: () => Promise<void>;
  searchVault: (text: string) => Promise<QmdMatch[]>;
  isMergeEligible: (filePath: string) => Promise<boolean>;
  classifyCapture: (text: string, match: QmdMatch) => Promise<CaptureDecision>;
  createNote: (text: string, source: string, matches: QmdMatch[]) => Promise<CreateCaptureResult>;
  mergeIntoNote: (match: QmdMatch, text: string) => Promise<MergeCaptureResult>;
  reindex: () => Promise<void>;
}

export async function runCapturePipeline(
  config: GateConfig,
  text: string,
  source: string,
  dependencies: CapturePipelineDependencies,
  hooks: CaptureHooks = {},
): Promise<AddOutcome> {
  const timings: Record<string, number> = {};

  const runStage = async <T>(stage: CaptureStage, work: () => Promise<T>): Promise<T> => {
    await hooks.onStageChange?.(stage);
    const stageStart = Date.now();
    const result = await work();
    const durationMs = Date.now() - stageStart;
    timings[stage] = durationMs;
    await hooks.onTiming?.(stage, durationMs);
    return result;
  };

  await runStage("refresh", () => dependencies.refreshStore());

  const matches = await runStage("search", () => dependencies.searchVault(text));

  const mergeCandidates = await runStage("filter", async () => {
    const eligibleMatches = await Promise.all(
      matches.map(async (match) =>
        (await dependencies.isMergeEligible(match.filePath)) ? match : null,
      ),
    );
    return eligibleMatches.filter((match): match is QmdMatch => match !== null);
  });

  const topMatch = mergeCandidates[0];

  const finishMerged = async (merged: MergeCaptureResult): Promise<AddOutcome> => {
    await runStage("reindex", () => dependencies.reindex());
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
  };

  if (topMatch && topMatch.score >= config.merge.autoThreshold) {
    const merged = await runStage("write", () => dependencies.mergeIntoNote(topMatch, text));
    return finishMerged(merged);
  }

  if (topMatch && topMatch.score >= config.merge.suggestThreshold) {
    const decision = await runStage("classify", () => dependencies.classifyCapture(text, topMatch));
    if (decision.decision === "merge") {
      const merged = await runStage("write", () => dependencies.mergeIntoNote(topMatch, text));
      return finishMerged(merged);
    }
  }

  const created = await runStage("write", () => dependencies.createNote(text, source, matches));
  await runStage("reindex", () => dependencies.reindex());

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
