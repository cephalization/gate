import path from "node:path";
import React from "react";
import { Box, Text, render } from "ink";
import type { GateConfig } from "../types.js";
import { createShellSessionState, getShellQueueDepth, getShellWorkerState } from "./session.js";

export interface StartShellOptions {
  config: GateConfig;
  configPath: string;
}

function ShellApp({ config, configPath }: StartShellOptions) {
  const state = createShellSessionState();
  const queueDepth = getShellQueueDepth(state);
  const workerState = getShellWorkerState(state);
  const vaultName = path.basename(config.vaultPath);

  return (
    <Box flexDirection="column">
      <Box borderStyle="round" flexDirection="column" paddingX={1}>
        <Text>
          gate shell | vault: {vaultName} | queue: {queueDepth} | worker: {workerState}
        </Text>
        <Text color="cyan">system shell bootstrap ready</Text>
        <Text>system config: {configPath}</Text>
        <Text>system vault: {config.vaultPath}</Text>
        <Text dimColor>system input handling, commands, and worker execution land next.</Text>
        <Text dimColor>hint Press Ctrl+C to quit.</Text>
        <Box marginTop={1} borderTop borderStyle="single" paddingTop={1}>
          <Text color="green">&gt; shell bootstrap ready</Text>
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
