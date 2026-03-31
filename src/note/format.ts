import type { NoteDocument, NoteFrontmatter, RawCaptureEntry } from "../types.js";

function renderFrontmatter(frontmatter: NoteFrontmatter): string[] {
  const lines = ["---"];

  for (const [key, value] of Object.entries(frontmatter)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.join(", ")}]`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }

  lines.push("---", "");
  return lines;
}

function parseFrontmatterValue(value: string): unknown {
  if (value.startsWith("[") && value.endsWith("]")) {
    return value
      .slice(1, -1)
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (/^-?\d+\.?\d*$/.test(value)) {
    return Number(value);
  }

  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}

export function renderRawCaptures(rawCaptures: RawCaptureEntry[]): string[] {
  const lines: string[] = ["## Raw Capture", ""];

  rawCaptures.forEach((capture, index) => {
    if (index > 0) {
      lines.push("");
    }
    lines.push(`<!-- ${capture.timestamp} -->`);
    lines.push(capture.text.trim());
  });

  lines.push("");
  return lines;
}

export function renderNote(document: NoteDocument): string {
  const lines = [...renderFrontmatter(document.frontmatter)];

  if (document.summary) {
    lines.push("## Summary", "", document.summary.trim(), "");
  }

  lines.push(...renderRawCaptures(document.rawCaptures));

  if (document.related && document.related.length > 0) {
    lines.push("## Related", "");
    for (const title of document.related) {
      lines.push(`- [[${title}]]`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

export function parseNote(content: string): NoteDocument {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const frontmatter: Record<string, unknown> = {};
  let body = content;

  if (match) {
    const frontmatterLines = match[1].split("\n");
    body = match[2];

    for (const line of frontmatterLines) {
      const separatorIndex = line.indexOf(":");
      if (separatorIndex === -1) continue;
      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      frontmatter[key] = parseFrontmatterValue(value);
    }
  }

  const summaryMatch = body.match(/## Summary\n\n([\s\S]*?)(?:\n## Raw Capture|$)/);
  const rawCaptureMatch = body.match(/## Raw Capture\n\n([\s\S]*?)(?:\n## Related|$)/);
  const relatedMatch = body.match(/## Related\n\n([\s\S]*?)$/);

  const rawCaptureSection = rawCaptureMatch?.[1]?.trim() ?? "";
  const rawCaptures = parseRawCaptures(rawCaptureSection);
  const related = relatedMatch
    ? relatedMatch[1]
        .split("\n")
        .map((line) => line.trim().match(/^- \[\[(.*)\]\]$/)?.[1])
        .filter((value): value is string => Boolean(value))
    : [];

  return {
    frontmatter: frontmatter as NoteFrontmatter,
    summary: summaryMatch?.[1]?.trim() || undefined,
    rawCaptures,
    related,
  };
}

function parseRawCaptures(section: string): RawCaptureEntry[] {
  if (!section) return [];

  const matches = [...section.matchAll(/<!--\s*(.*?)\s*-->\n([\s\S]*?)(?=(?:\n<!--)|$)/g)];
  if (matches.length === 0) {
    return [{ timestamp: new Date().toISOString(), text: section.trim() }];
  }

  return matches.map((match) => ({
    timestamp: match[1].trim(),
    text: match[2].trim(),
  }));
}
