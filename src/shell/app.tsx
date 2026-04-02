import path from "node:path";
import React from "react";
import { Box, Text, render, useInput } from "ink";
import type { GateConfig } from "../types.js";
import { formatDurationMs } from "../timing.js";
import {
  canNavigateShellHistory,
  getShellSubmitModeLabel,
  isShellNewlineKey,
  isShellSubmitKey,
  isShellSubmitModeToggleKey,
  navigateShellHistory,
  pushShellHistory,
} from "./input.js";
import { createShellSessionState, getShellQueueDepth, getShellWorkerState } from "./session.js";
import { createShellWorker } from "./worker.js";

export interface StartShellOptions {
  config: GateConfig;
  configPath: string;
}

function ShellApp({ config, configPath }: StartShellOptions) {
  const [worker] = React.useState(() => createShellWorker({ config }));
  const [state, setState] = React.useState(() => worker.getState() ?? createShellSessionState());
  const [input, setInput] = React.useState("");
  const [history, setHistory] = React.useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = React.useState<number | null>(null);
  const [historyDraft, setHistoryDraft] = React.useState("");

  React.useEffect(() => worker.subscribe(setState), [worker]);

  useInput((value, key) => {
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
          hint {submitModeLabel} | Ctrl+J toggle submit mode | Up/Down history | Ctrl+C quits
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
    exitOnCtrlC: true,
  });

  await instance.waitUntilExit();
}
