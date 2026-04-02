export type ShellCommandName = "help" | "quit" | "queue" | "search" | "related";

export interface ParsedShellCommand {
  name: ShellCommandName | "invalid" | null;
  raw: string;
  query?: string;
  error?: string;
}

export type ShellQuitRequestSource = "interrupt" | "command";

export interface ResolveShellQuitRequestInput {
  hasPendingWork: boolean;
  hasWarnedAboutPendingWork: boolean;
  source: ShellQuitRequestSource;
}

export interface ResolveShellQuitRequestResult {
  shouldExit: boolean;
  shouldWarn: boolean;
  forceExit: boolean;
  nextWarnedAboutPendingWork: boolean;
  warningMessage: string | null;
}

const SHELL_HELP_LINES = [
  "commands:",
  "/help show available shell commands",
  "/queue show queued jobs, active work, recent finished jobs, and state counts",
  "/search <query> run a QMD search without writing notes",
  "/related <query> show compact related-note matches in the log",
  "/quit quit when idle, or warn if work is still pending",
] as const;

export function parseShellCommand(input: string): ParsedShellCommand {
  const raw = input.trim();

  if (!raw.startsWith("/")) {
    return { name: null, raw };
  }

  const firstSpaceIndex = raw.indexOf(" ");
  const commandToken = (firstSpaceIndex === -1 ? raw : raw.slice(0, firstSpaceIndex)).toLowerCase();
  const query = (firstSpaceIndex === -1 ? "" : raw.slice(firstSpaceIndex + 1)).trim();

  if (commandToken === "/help" && query.length === 0) {
    return { name: "help", raw };
  }

  if (commandToken === "/quit" && query.length === 0) {
    return { name: "quit", raw };
  }

  if (commandToken === "/queue" && query.length === 0) {
    return { name: "queue", raw };
  }

  if (commandToken === "/search") {
    return query.length > 0
      ? { name: "search", raw, query }
      : { name: "invalid", raw, error: "missing query for /search" };
  }

  if (commandToken === "/related") {
    return query.length > 0
      ? { name: "related", raw, query }
      : { name: "invalid", raw, error: "missing query for /related" };
  }

  return { name: "invalid", raw, error: `unknown slash command: ${commandToken}` };
}

export function getShellHelpLines(): readonly string[] {
  return SHELL_HELP_LINES;
}

export function resolveShellQuitRequest({
  hasPendingWork,
  hasWarnedAboutPendingWork,
  source,
}: ResolveShellQuitRequestInput): ResolveShellQuitRequestResult {
  if (!hasPendingWork) {
    return {
      shouldExit: true,
      shouldWarn: false,
      forceExit: false,
      nextWarnedAboutPendingWork: false,
      warningMessage: null,
    };
  }

  if (source === "interrupt" && hasWarnedAboutPendingWork) {
    return {
      shouldExit: true,
      shouldWarn: false,
      forceExit: true,
      nextWarnedAboutPendingWork: true,
      warningMessage: null,
    };
  }

  return {
    shouldExit: false,
    shouldWarn: true,
    forceExit: false,
    nextWarnedAboutPendingWork: true,
    warningMessage:
      source === "interrupt"
        ? "pending work still running; press Ctrl+C again to force quit"
        : "pending work still running; wait for queue to drain or press Ctrl+C to force quit",
  };
}
