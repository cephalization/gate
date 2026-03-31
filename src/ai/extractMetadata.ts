import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import type { GateConfig, IngestMetadata } from "../types.js";

const MetadataSchema = z.object({
  title: z.string().describe("A concise title for the note"),
  summary: z.string().describe("A short summary of the note"),
  topics: z.array(z.string()).describe("Key topics"),
  entities: z.array(z.string()).describe("People, projects, systems, or other named entities"),
  noteType: z.enum(["idea", "meeting", "postmortem", "reference", "task"]),
  confidence: z.number().min(0).max(1),
  suggestedLinks: z.array(z.string()).describe("Only titles from provided existing notes"),
});

export async function createLanguageModel(config: GateConfig) {
  const { provider, model } = config.ai;

  switch (provider) {
    case "openai":
      return createOpenAI({ apiKey: process.env.OPENAI_API_KEY })(model);
    case "anthropic": {
      try {
        const mod = await (Function('return import("@ai-sdk/anthropic")')() as Promise<{
          createAnthropic: typeof createOpenAI;
        }>);
        return mod.createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })(model);
      } catch {
        return createOpenAI({ apiKey: process.env.OPENAI_API_KEY })(model);
      }
    }
    case "google": {
      try {
        const mod = await (Function('return import("@ai-sdk/google")')() as Promise<{
          createGoogleGenerativeAI: typeof createOpenAI;
        }>);
        return mod.createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY })(
          model,
        );
      } catch {
        return createOpenAI({ apiKey: process.env.OPENAI_API_KEY })(model);
      }
    }
    default:
      return createOpenAI({ apiKey: process.env.OPENAI_API_KEY })(model);
  }
}

export async function extractMetadata(
  text: string,
  config: GateConfig,
  existingNoteTitles: string[] = [],
): Promise<IngestMetadata | null> {
  if (!config.ai.enabled) return null;

  try {
    const model = await createLanguageModel(config);
    const titlesBlock = existingNoteTitles.length
      ? `\nExisting note titles in the vault:\n${existingNoteTitles
          .slice(0, 30)
          .map((title) => `- ${title}`)
          .join("\n")}`
      : "";

    const { object } = await generateObject({
      model,
      schema: MetadataSchema,
      temperature: config.ai.temperature,
      maxTokens: config.ai.maxTokens,
      prompt: `Analyze this note capture and extract structured metadata.${titlesBlock}

Rules:
- Keep topics short and lowercase.
- Only include suggestedLinks that exactly match provided existing note titles.
- If no exact title fits, return an empty suggestedLinks array.

Capture:
${text}`,
    });

    return object;
  } catch {
    return null;
  }
}

export function extractMetadataFallback(text: string): Partial<IngestMetadata> {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const firstLine = lines[0] || "Untitled Note";
  const lowerFirst = firstLine.toLowerCase();
  let noteType: IngestMetadata["noteType"] = "idea";

  if (lowerFirst.includes("meeting")) noteType = "meeting";
  else if (lowerFirst.includes("postmortem") || lowerFirst.includes("incident"))
    noteType = "postmortem";
  else if (lowerFirst.includes("task") || lowerFirst.includes("todo")) noteType = "task";
  else if (lowerFirst.includes("ref") || lowerFirst.includes("doc")) noteType = "reference";

  const words = text.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
  const counts = new Map<string, number>();
  for (const word of words) {
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  const topics = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);

  const entities = [
    ...new Set(text.match(/(?<=[a-z]\s)[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || []),
  ].slice(0, 5);

  return {
    title: firstLine
      .replace(/^(meeting note|idea|note|task|postmortem|ref|reference):\s*/i, "")
      .trim(),
    summary: lines.slice(0, 2).join(" ").slice(0, 200),
    topics,
    entities,
    noteType,
    confidence: 0.3,
    suggestedLinks: [],
  };
}
