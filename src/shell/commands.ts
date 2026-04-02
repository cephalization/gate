export type ShellCommandName = "help" | "quit";

export type ParsedShellCommand =
  | {
      name: ShellCommandName;
      raw: string;
    }
  | {
      name: null;
      raw: string;
    };

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
  "/quit quit when idle, or warn if work is still pending",
] as const;

export function parseShellCommand(input: string): ParsedShellCommand {
  const raw = input.trim();

  if (raw === "/help") {
    return { name: "help", raw };
  }

  if (raw === "/quit") {
    return { name: "quit", raw };
  }

  return { name: null, raw };
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
