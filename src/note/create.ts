import * as fs from "node:fs/promises";
import * as path from "node:path";
import { extractMetadata, extractMetadataFallback } from "../ai/extractMetadata.js";
import {
  generateNoteId,
  getCurrentDate,
  titleToFilename,
  extractTitle,
  uniqueStrings,
} from "../normalize.js";
import { renderNote } from "./format.js";
import type { GateConfig, NoteDocument, NoteFrontmatter, QmdMatch } from "../types.js";

export interface CreateNoteResult {
  title: string;
  noteId: string;
  filePath: string;
  aiEnriched: boolean;
  related: string[];
}

export async function createNote(
  config: GateConfig,
  text: string,
  source: string,
  matches: QmdMatch[],
): Promise<CreateNoteResult> {
  let metadata = await extractMetadata(
    text,
    config,
    matches.map((match) => match.title),
  );
  const aiEnriched = metadata !== null;

  if (!metadata) {
    metadata = {
      title: extractTitle(text),
      summary: "",
      topics: [],
      entities: [],
      noteType: "idea",
      confidence: 0.3,
      suggestedLinks: [],
      ...extractMetadataFallback(text),
    };
  }

  const noteId = generateNoteId();
  const date = getCurrentDate();
  const related = uniqueStrings(
    matches
      .filter((match) => match.score >= 0.3)
      .map((match) => match.title)
      .slice(0, 5),
  );

  const frontmatter: NoteFrontmatter = {
    id: noteId,
    created: date,
    updated: date,
    source,
    title: metadata.title,
    noteType: metadata.noteType,
    topics: metadata.topics,
    entities: metadata.entities,
    confidence: metadata.confidence,
  };

  const document: NoteDocument = {
    frontmatter,
    summary: metadata.summary || undefined,
    rawCaptures: [{ timestamp: new Date().toISOString(), text }],
    related,
  };

  const folderPath = path.join(config.vaultPath, config.defaultFolder);
  await fs.mkdir(folderPath, { recursive: true });

  const filename = `${titleToFilename(metadata.title)}-${noteId.slice(0, 10)}.md`;
  const filePath = path.join(folderPath, filename);
  await fs.writeFile(filePath, renderNote(document), "utf-8");

  return {
    title: metadata.title,
    noteId,
    filePath,
    aiEnriched,
    related,
  };
}
