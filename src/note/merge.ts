import * as fs from "node:fs/promises";
import { extractMetadata, extractMetadataFallback } from "../ai/extractMetadata.js";
import { getCurrentDate, extractTitle, uniqueStrings } from "../normalize.js";
import { parseNote, renderNote } from "./format.js";
import type { GateConfig, NoteDocument, QmdMatch } from "../types.js";

export interface MergeNoteResult {
  title: string;
  noteId: string;
  filePath: string;
  aiEnriched: boolean;
}

function allRawText(note: NoteDocument): string {
  return note.rawCaptures.map((capture) => capture.text.trim()).join("\n\n");
}

export async function mergeIntoNote(
  config: GateConfig,
  match: QmdMatch,
  text: string,
): Promise<MergeNoteResult> {
  const content = await fs.readFile(match.filePath, "utf-8");
  const note = parseNote(content);

  note.rawCaptures.push({ timestamp: new Date().toISOString(), text });

  const combinedText = allRawText(note);
  let metadata = await extractMetadata(combinedText, config, [
    note.frontmatter.title ?? match.title,
  ]);
  const aiEnriched = metadata !== null;

  if (!metadata) {
    metadata = {
      title: note.frontmatter.title ?? extractTitle(combinedText),
      summary: note.summary ?? "",
      topics: [],
      entities: [],
      noteType: note.frontmatter.noteType ?? "idea",
      confidence: note.frontmatter.confidence ?? 0.3,
      suggestedLinks: note.related ?? [],
      ...extractMetadataFallback(combinedText),
    };
  }

  note.frontmatter.updated = getCurrentDate();
  note.frontmatter.title = note.frontmatter.title ?? metadata.title;
  note.frontmatter.noteType = metadata.noteType;
  note.frontmatter.topics = uniqueStrings([...(note.frontmatter.topics ?? []), ...metadata.topics]);
  note.frontmatter.entities = uniqueStrings([
    ...(note.frontmatter.entities ?? []),
    ...metadata.entities,
  ]);
  note.frontmatter.confidence = metadata.confidence;
  note.summary = metadata.summary || note.summary;
  note.related = uniqueStrings([...(note.related ?? []), ...metadata.suggestedLinks]).slice(0, 8);

  await fs.writeFile(match.filePath, renderNote(note), "utf-8");

  return {
    title: note.frontmatter.title ?? metadata.title,
    noteId: note.frontmatter.id,
    filePath: match.filePath,
    aiEnriched,
  };
}
