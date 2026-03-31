import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { HybridQueryResult } from "@tobilu/qmd";
import type { GateConfig, QmdMatch, RelatedNoteResult } from "../types.js";
import { getStore } from "./index.js";

function resolveFilePath(config: GateConfig, result: HybridQueryResult): string {
  if (path.isAbsolute(result.file)) {
    return result.file;
  }

  if (result.file.startsWith("qmd://")) {
    const displayPath = result.displayPath.replace(/^vault\//, "");
    return path.join(config.vaultPath, displayPath);
  }

  return path.join(config.vaultPath, result.file.replace(/^vault\//, ""));
}

function toMatch(config: GateConfig, result: HybridQueryResult): QmdMatch {
  return {
    title: result.title,
    score: result.score,
    filePath: resolveFilePath(config, result),
    body: result.body,
  };
}

export async function searchVault(
  config: GateConfig,
  query: string,
  options: { limit?: number; minScore?: number; rerank?: boolean } = {},
): Promise<QmdMatch[]> {
  const store = await getStore(config);
  const results = await store.search({
    query,
    limit: options.limit ?? 5,
    minScore: options.minScore ?? 0.3,
    rerank: options.rerank ?? true,
  });

  const matches = results.map((result) => toMatch(config, result));
  const resolved = await Promise.all(
    matches.map(async (match) => {
      try {
        await fs.access(match.filePath);
        return match;
      } catch {
        return null;
      }
    }),
  );

  return resolved.filter((match): match is QmdMatch => match !== null);
}

export function matchesToRelatedResults(matches: QmdMatch[]): RelatedNoteResult[] {
  return matches.map((match) => ({
    title: match.title,
    score: match.score,
    rationale: `QMD semantic match ${(match.score * 100).toFixed(1)}%`,
    filePath: match.filePath,
  }));
}
