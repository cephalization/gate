export function generateNoteId(date: Date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-").slice(0, -5) + "Z";
}

export function getCurrentDate(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function titleToFilename(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 100)
    .replace(/^-|-$/g, "");
}

export function extractTitle(text: string, maxLength: number = 60): string {
  const firstLine = text.split("\n")[0]?.trim() ?? "Untitled Note";
  const cleaned = firstLine
    .replace(/^(meeting note|idea|note|task|postmortem|ref|reference):\s*/i, "")
    .trim();

  if (cleaned.length <= maxLength) {
    return cleaned || "Untitled Note";
  }

  const truncated = cleaned.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > maxLength * 0.6) {
    return truncated.slice(0, lastSpace) + "...";
  }

  return truncated + "...";
}

export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
