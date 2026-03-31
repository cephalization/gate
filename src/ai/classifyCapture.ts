import { generateObject } from "ai";
import { z } from "zod";
import type { CaptureDecision, GateConfig, QmdMatch } from "../types.js";
import { extractMetadataFallback } from "./extractMetadata.js";
import { createLanguageModel } from "./extractMetadata.js";

const ClassificationSchema = z.object({
  decision: z.enum(["merge", "new"]),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});

export async function classifyCapture(
  config: GateConfig,
  capture: string,
  match: QmdMatch,
): Promise<CaptureDecision> {
  if (!config.ai.enabled) {
    return {
      decision: match.score >= config.merge.autoThreshold ? "merge" : "new",
      confidence: match.score,
      reason: "AI disabled; falling back to score threshold.",
    };
  }

  try {
    const model = await createLanguageModel(config);
    const { object } = await generateObject({
      model,
      schema: ClassificationSchema,
      temperature: 0,
      maxTokens: 250,
      prompt: `You are deciding whether a new note capture should be merged into an existing note or become a new note.

Merge when the new capture is clearly a continuation, update, or additional detail for the same note.
Create a new note when it is only loosely related, starts a different thread, or would make the existing note less focused.

Existing note title: ${match.title}
Existing note content excerpt:
${match.body.slice(0, 1500)}

New capture:
${capture}

Respond with a decision, confidence, and short reason.`,
    });

    return object;
  } catch {
    const fallback = extractMetadataFallback(capture);
    return {
      decision: match.score >= config.merge.autoThreshold ? "merge" : "new",
      confidence: Math.max(match.score, fallback.confidence ?? 0.3),
      reason: "Classification failed; falling back to score threshold.",
    };
  }
}
