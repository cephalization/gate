import type { ShellSubmitMode } from "./types.js";

export interface ShellInputKey {
  return?: boolean;
  shift?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  upArrow?: boolean;
  downArrow?: boolean;
  backspace?: boolean;
  delete?: boolean;
}

export interface ShellHistoryNavigationInput {
  history: string[];
  input: string;
  index: number | null;
  draft: string;
  direction: "up" | "down";
}

export interface ShellHistoryNavigationResult {
  input: string;
  index: number | null;
  draft: string;
}

export function canNavigateShellHistory(input: string): boolean {
  return !input.includes("\n");
}

export function getShellSubmitModeLabel(mode: ShellSubmitMode): string {
  return mode === "enter-submit"
    ? "Enter submits, Shift+Enter newline"
    : "Shift+Enter submits, Enter newline";
}

export function isShellSubmitModeToggleKey(value: string, key: ShellInputKey): boolean {
  return Boolean(key.ctrl && (value.toLowerCase() === "j" || key.return));
}

export function isShellSubmitKey(mode: ShellSubmitMode, key: ShellInputKey): boolean {
  if (!key.return) {
    return false;
  }

  return mode === "enter-submit" ? !key.shift : Boolean(key.shift);
}

export function isShellNewlineKey(mode: ShellSubmitMode, key: ShellInputKey): boolean {
  if (!key.return) {
    return false;
  }

  return mode === "enter-submit" ? Boolean(key.shift) : !key.shift;
}

export function pushShellHistory(history: string[], input: string, limit = 50): string[] {
  if (input.length === 0) {
    return history;
  }

  return [...history, input].slice(-limit);
}

export function navigateShellHistory({
  history,
  input,
  index,
  draft,
  direction,
}: ShellHistoryNavigationInput): ShellHistoryNavigationResult {
  const singleLineHistory = history.filter((entry) => !entry.includes("\n"));
  if (singleLineHistory.length === 0) {
    return { input, index, draft };
  }

  if (direction === "up") {
    const nextIndex = index === null ? singleLineHistory.length - 1 : Math.max(index - 1, 0);
    return {
      input: singleLineHistory[nextIndex] ?? input,
      index: nextIndex,
      draft: index === null ? input : draft,
    };
  }

  if (index === null) {
    return { input, index, draft };
  }

  const nextIndex = index + 1;
  if (nextIndex >= singleLineHistory.length) {
    return {
      input: draft,
      index: null,
      draft: "",
    };
  }

  return {
    input: singleLineHistory[nextIndex] ?? input,
    index: nextIndex,
    draft,
  };
}
