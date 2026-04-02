import path from "node:path";
import React from "react";
import { Box, Text, render, useApp, useInput } from "ink";
import type { GateConfig } from "../types.js";
import { formatDurationMs } from "../timing.js";
import { getShellHelpLines, parseShellCommand, resolveShellQuitRequest } from "./commands.js";
import {
  canNavigateShellHistory,
  getShellSubmitModeLabel,
  isShellNewlineKey,
  isShellSubmitKey,
  isShellSubmitModeToggleKey,
  navigateShellHistory,
  pushShellHistory,
} from "./input.js";
import {
  createShellSessionState,
  getShellQueueDepth,
  getShellWorkerState,
  hasPendingShellWork,
} from "./session.js";
import { createShellWorker } from "./worker.js";

export interface StartShellOptions {
  config: GateConfig;
  configPath: string;
}

function ShellApp({ config, configPath }: StartShellOptions) {
  const { exit } = useApp();
  const [worker] = React.useState(() => createShellWorker({ config }));
  const [state, setState] = React.useState(() => worker.getState() ?? createShellSessionState());
  const [input, setInput] = React.useState("");
  const [history, setHistory] = React.useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = React.useState<number | null>(null);
  const [historyDraft, setHistoryDraft] = React.useState("");
  const [hasWarnedAboutPendingQuit, setHasWarnedAboutPendingQuit] = React.useState(false);
  const hasWarnedAboutPendingQuitRef = React.useRef(false);

  React.useEffect(() => worker.subscribe(setState), [worker]);

  const appendLog = React.useCallback(
    (kind: "system" | "command" | "error", message: string) => {
      worker.appendLog(kind, message);
    },
    [worker],
  );

  const requestQuit = React.useCallback(
    (source: "interrupt" | "command") => {
      const currentState = worker.getState();
      const nextAction = resolveShellQuitRequest({
        hasPendingWork: hasPendingShellWork(currentState),
        hasWarnedAboutPendingWork: hasWarnedAboutPendingQuitRef.current,
        source,
      });

      hasWarnedAboutPendingQuitRef.current = nextAction.nextWarnedAboutPendingWork;
      setHasWarnedAboutPendingQuit(nextAction.nextWarnedAboutPendingWork);

      if (nextAction.shouldWarn && nextAction.warningMessage) {
        appendLog(source === "interrupt" ? "error" : "system", nextAction.warningMessage);
        return;
      }

      if (nextAction.forceExit) {
        appendLog("error", "forcing shell exit with pending work");
      }

      if (nextAction.shouldExit) {
        exit();
      }
    },
    [appendLog, exit, worker],
  );

  React.useEffect(() => {
    if (!hasPendingShellWork(state) && hasWarnedAboutPendingQuit) {
      hasWarnedAboutPendingQuitRef.current = false;
      setHasWarnedAboutPendingQuit(false);
    }
  }, [hasWarnedAboutPendingQuit, state]);

  React.useEffect(() => {
    const handleSigint = () => {
      requestQuit("interrupt");
    };

    process.on("SIGINT", handleSigint);
    return () => {
      process.off("SIGINT", handleSigint);
    };
  }, [requestQuit]);

  useInput((value, key) => {
    if (key.ctrl && value.toLowerCase() === "c") {
      requestQuit("interrupt");
      return;
    }

    if (isShellSubmitModeToggleKey(value, key)) {
      worker.toggleSubmitMode();
      return;
    }

    if (key.upArrow || key.downArrow) {
      if (!canNavigateShellHistory(input)) {
        return;
      }

      const nextHistoryState = navigateShellHistory({
        history,
        input,
        index: historyIndex,
        draft: historyDraft,
        direction: key.upArrow ? "up" : "down",
      });

      setInput(nextHistoryState.input);
      setHistoryIndex(nextHistoryState.index);
      setHistoryDraft(nextHistoryState.draft);
      return;
    }

    if (isShellSubmitKey(state.submitMode, key)) {
      const submitted = input.trim();
      if (!submitted) {
        return;
      }

      const command = parseShellCommand(submitted);
      if (command.name === "help") {
        for (const line of getShellHelpLines()) {
          appendLog("command", line);
        }
        setInput("");
        setHistory((current) => pushShellHistory(current, submitted));
        setHistoryIndex(null);
        setHistoryDraft("");
        return;
      }

      if (command.name === "quit") {
        appendLog("command", "/quit");
        setInput("");
        setHistory((current) => pushShellHistory(current, submitted));
        setHistoryIndex(null);
        setHistoryDraft("");
        requestQuit("command");
        return;
      }

      setInput("");
      setHistory((current) => pushShellHistory(current, submitted));
      setHistoryIndex(null);
      setHistoryDraft("");
      worker.enqueue(submitted);
      return;
    }

    if (isShellNewlineKey(state.submitMode, key)) {
      setInput((current) => current + "\n");
      setHistoryIndex(null);
      setHistoryDraft("");
      return;
    }

    if (key.backspace || key.delete) {
      setInput((current) => current.slice(0, -1));
      setHistoryIndex(null);
      setHistoryDraft("");
      return;
    }

    if (key.ctrl || key.meta || value.length === 0) {
      return;
    }

    setInput((current) => current + value);
    setHistoryIndex(null);
    setHistoryDraft("");
  });

  const queueDepth = getShellQueueDepth(state);
  const workerState = getShellWorkerState(state);
  const vaultName = path.basename(config.vaultPath);
  const visibleLog = state.log.slice(-8);
  const inputLines = input.length === 0 ? [""] : input.split("\n");
  const submitModeLabel = getShellSubmitModeLabel(state.submitMode);

  return (
    <Box flexDirection="column">
      <Box borderStyle="round" flexDirection="column" paddingX={1}>
        <Text>
          gate shell | vault: {vaultName} | queue: {queueDepth} | worker: {workerState}
        </Text>
        <Text color="cyan">
          system freeform captures queue immediately and process in background
        </Text>
        <Text>system config: {configPath}</Text>
        <Text>system vault: {config.vaultPath}</Text>
        <Text>
          system completed: {state.stats.completed} | failed: {state.stats.failed} | avg:{" "}
          {formatDurationMs(Math.round(state.stats.averageDurationMs))}
        </Text>
        <Text dimColor>
          hint {submitModeLabel} | Ctrl+J toggle submit mode | Up/Down history | /help | Ctrl+C
          quits
        </Text>
        <Box marginTop={1} borderTop borderStyle="single" paddingTop={1}>
          {visibleLog.length === 0 ? (
            <Text color="green">system shell worker ready</Text>
          ) : (
            <Box flexDirection="column">
              {visibleLog.map((event) => (
                <Text
                  key={event.id}
                  color={
                    event.kind === "error" ? "red" : event.kind === "result" ? "green" : undefined
                  }
                >
                  {event.message}
                </Text>
              ))}
            </Box>
          )}
        </Box>
        <Box marginTop={1} borderTop borderStyle="single" paddingTop={1} flexDirection="column">
          {inputLines.map((line, index) => (
            <Text key={`${index}-${line}`} color="green">
              {index === 0 ? "> " : "  "}
              {line.length > 0 ? line : " "}
            </Text>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

export async function startShell(options: StartShellOptions): Promise<void> {
  const instance = render(<ShellApp {...options} />, {
    exitOnCtrlC: false,
  });

  await instance.waitUntilExit();
}
