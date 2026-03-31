import { z } from "zod";

export const NoteTypeSchema = z.enum(["idea", "meeting", "postmortem", "reference", "task"]);
export type NoteType = z.infer<typeof NoteTypeSchema>;

export const IngestMetadataSchema = z.object({
  title: z.string(),
  summary: z.string(),
  topics: z.array(z.string()),
  entities: z.array(z.string()),
  noteType: NoteTypeSchema,
  confidence: z.number().min(0).max(1),
  suggestedLinks: z.array(z.string()),
});
export type IngestMetadata = z.infer<typeof IngestMetadataSchema>;

export const NoteFrontmatterSchema = z.object({
  id: z.string(),
  created: z.string(),
  updated: z.string(),
  source: z.string(),
  title: z.string().optional(),
  noteType: NoteTypeSchema.optional(),
  topics: z.array(z.string()).optional(),
  entities: z.array(z.string()).optional(),
  confidence: z.number().optional(),
});
export type NoteFrontmatter = z.infer<typeof NoteFrontmatterSchema>;

export interface RawCaptureEntry {
  timestamp: string;
  text: string;
}

export interface NoteDocument {
  frontmatter: NoteFrontmatter;
  summary?: string;
  rawCaptures: RawCaptureEntry[];
  related?: string[];
}

export const AIConfigSchema = z.object({
  enabled: z.boolean().default(true),
  provider: z.string().default("openai"),
  model: z.string().default("gpt-4.1-mini"),
  temperature: z.number().default(0.1),
  maxTokens: z.number().default(600),
});
export type AIConfig = z.infer<typeof AIConfigSchema>;

export const MergeConfigSchema = z.object({
  autoThreshold: z.number().min(0).max(1).default(0.85),
  suggestThreshold: z.number().min(0).max(1).default(0.7),
});
export type MergeConfig = z.infer<typeof MergeConfigSchema>;

export const GateConfigSchema = z.object({
  vaultPath: z.string(),
  defaultFolder: z.string().default("Inbox"),
  ai: AIConfigSchema.default({}),
  merge: MergeConfigSchema.default({}),
});
export type GateConfig = z.infer<typeof GateConfigSchema>;

export interface RelatedNoteResult {
  title: string;
  score: number;
  rationale: string;
  filePath: string;
}

export interface VaultCandidate {
  path: string;
  name: string;
}

export interface QmdMatch {
  title: string;
  score: number;
  filePath: string;
  body: string;
}

export const CaptureDecisionSchema = z.object({
  decision: z.enum(["merge", "new"]),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});
export type CaptureDecision = z.infer<typeof CaptureDecisionSchema>;

export interface AddOutcomeBase {
  success: boolean;
  title: string;
  filePath: string;
  timings: Record<string, number>;
}

export interface AddCreateOutcome extends AddOutcomeBase {
  action: "created";
  noteId: string;
  aiEnriched: boolean;
  related: string[];
}

export interface AddMergeOutcome extends AddOutcomeBase {
  action: "merged";
  noteId: string;
  aiEnriched: boolean;
  mergedIntoTitle: string;
}

export type AddOutcome = AddCreateOutcome | AddMergeOutcome;
