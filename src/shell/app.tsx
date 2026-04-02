import path from "node:path";
import React from "react";
import { Box, Text, render, useInput } from "ink";
import type { GateConfig } from "../types.js";
import { formatDurationMs } from "../timing.js";
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

  React.useEffect(() => worker.subscribe(setState), [worker]);

  useInput((value, key) => {
    if (key.return) {
      const submitted = input.trim();
      if (!submitted) {
        return;
      }

      setInput("");
      worker.enqueue(submitted);
      return;
    }

    if (key.backspace || key.delete) {
      setInput((current) => current.slice(0, -1));
      return;
    }

    if (key.ctrl || key.meta || value.length === 0) {
      return;
    }

    setInput((current) => current + value);
  });

  const queueDepth = getShellQueueDepth(state);
  const workerState = getShellWorkerState(state);
  const vaultName = path.basename(config.vaultPath);
  const visibleLog = state.log.slice(-8);

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
        <Text dimColor>hint Enter submits a capture. Ctrl+C quits.</Text>
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
        <Box marginTop={1}>
          <Text color="green">&gt; {input}</Text>
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
