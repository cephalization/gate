import path from "node:path";
import { findRelatedFromConfig } from "../commands/related.js";
import { captureNoteWithHooks } from "../note/upsert.js";
import type { CaptureHooks } from "../note/capture-pipeline.js";
import { searchVault } from "../store/search.js";
import type { AddOutcome, GateConfig, QmdMatch, RelatedNoteResult } from "../types.js";
import { getShellHelpLines, parseShellCommand } from "./commands.js";
import {
  createQueuedShellLogEvent,
  createShellJobErrorLogEvent,
  createShellJobResultLogEvent,
  createShellJobStateLogEvent,
} from "./events.js";
import {
  completeShellJob,
  createShellJob,
  failShellJob,
  getNextQueuedShellJob,
  recordShellJobTiming,
  transitionShellJob,
} from "./queue.js";
import {
  addShellJob,
  appendShellLogEvent,
  createShellSessionState,
  getShellQueueInspectionLines,
  setShellSubmitMode,
  setActiveShellJobId,
  toggleShellSubmitMode,
  updateShellSessionJob,
} from "./session.js";
import type { ShellJob, ShellLogKind, ShellSessionState } from "./types.js";

const STAGE_TO_JOB_STATE = {
  refresh: "refreshing",
  search: "searching",
  filter: "filtering",
  classify: "classifying",
  write: "writing",
  reindex: "reindexing",
} as const;

export interface ShellWorkerDependencies {
  capture?: (
    config: GateConfig,
    text: string,
    source: string,
    hooks?: CaptureHooks,
  ) => Promise<AddOutcome>;
  createJobId?: () => string;
  createEventId?: () => string;
  now?: () => string;
  search?: (config: GateConfig, query: string) => Promise<QmdMatch[]>;
  related?: (config: GateConfig, query: string) => Promise<RelatedNoteResult[]>;
  requestQuit?: () => void;
}

export interface ShellWorker {
  enqueue: (input: string) => ShellJob;
  appendLog: (kind: ShellLogKind, message: string) => void;
  getState: () => ShellSessionState;
  subscribe: (listener: (state: ShellSessionState) => void) => () => void;
  toggleSubmitMode: () => void;
}

export interface CreateShellWorkerOptions extends ShellWorkerDependencies {
  config: GateConfig;
}

export function createShellWorker(options: CreateShellWorkerOptions): ShellWorker {
  const capture = options.capture ?? captureNoteWithHooks;
  const now = options.now ?? (() => new Date().toISOString());
  const search =
    options.search ??
    ((config: GateConfig, query: string) =>
      searchVault(config, query, {
        limit: 5,
        minScore: 0.3,
      }));
  const related =
    options.related ??
    ((config: GateConfig, query: string) => findRelatedFromConfig(config, query, { top: 8 }));
  const listeners = new Set<(state: ShellSessionState) => void>();
  let nextJobNumber = 1;
  let nextEventNumber = 1;
  let processing = false;
  let state = createShellSessionState();

  const createJobId = options.createJobId ?? (() => String(nextJobNumber++));
  const createEventId = options.createEventId ?? (() => `evt-${nextEventNumber++}`);

  const publishState = (nextState: ShellSessionState): ShellSessionState => {
    state = nextState;
    for (const listener of listeners) {
      listener(state);
    }
    return state;
  };

  const setState = (
    update: (current: ShellSessionState) => ShellSessionState,
  ): ShellSessionState => {
    return publishState(update(state));
  };

  const appendCommandOutput = (kind: ShellLogKind, message: string): void => {
    setState((current) =>
      appendShellLogEvent(current, {
        id: createEventId(),
        timestamp: now(),
        kind,
        message,
      }),
    );
  };

  const toShellPath = (filePath: string): string => {
    const relativePath = path.relative(options.config.vaultPath, filePath);
    return relativePath.length > 0 && !relativePath.startsWith("..") ? relativePath : filePath;
  };

  const formatSearchLine = (match: QmdMatch): string => {
    return `search ${(match.score * 100).toFixed(1)}% ${match.title} - ${toShellPath(match.filePath)}`;
  };

  const formatRelatedLine = (result: RelatedNoteResult): string => {
    return `related ${(result.score * 100).toFixed(1)}% ${result.title} - ${toShellPath(result.filePath)}`;
  };

  const processCommandJob = async (job: ShellJob): Promise<void> => {
    const timestamp = now();
    const parsedCommand = parseShellCommand(job.input);

    setState((current) =>
      appendShellLogEvent(current, {
        id: createEventId(),
        timestamp,
        kind: "command",
        message: parsedCommand.raw,
      }),
    );

    if (parsedCommand.name === null) {
      throw new Error("invalid command job");
    }

    if (parsedCommand.name === "invalid") {
      throw new Error(parsedCommand.error ?? "invalid slash command");
    }

    const command = parsedCommand;

    switch (command.name) {
      case "help":
        for (const line of getShellHelpLines()) {
          appendCommandOutput("system", line);
        }
        break;
      case "quit":
        options.requestQuit?.();
        break;
      case "queue":
        for (const line of getShellQueueInspectionLines(state)) {
          appendCommandOutput("system", line);
        }
        break;
      case "search": {
        const query = command.query ?? "";
        const matches = await search(options.config, query);

        if (matches.length === 0) {
          appendCommandOutput("system", `search no results for ${JSON.stringify(query)}`);
        } else {
          for (const match of matches) {
            appendCommandOutput("system", formatSearchLine(match));
          }
        }
        break;
      }
      case "related": {
        const query = command.query ?? "";
        const results = await related(options.config, query);

        if (results.length === 0) {
          appendCommandOutput("system", `related no results for ${JSON.stringify(query)}`);
        } else {
          for (const result of results) {
            appendCommandOutput("system", formatRelatedLine(result));
          }
        }
        break;
      }
    }

    setState((current) =>
      updateShellSessionJob(current, job.id, (queuedJob) => completeShellJob(queuedJob)),
    );
  };

  const processNextQueuedJob = async (): Promise<void> => {
    if (processing) {
      return;
    }

    const nextJob = getNextQueuedShellJob(state.queue);
    if (!nextJob) {
      return;
    }

    processing = true;
    setState((current) => setActiveShellJobId(current, nextJob.id));

    try {
      if (nextJob.kind === "command") {
        await processCommandJob(nextJob);
        return;
      }

      const result = await capture(options.config, nextJob.input, nextJob.source, {
        onStageChange: async (stage) => {
          const nextState = STAGE_TO_JOB_STATE[stage];
          const timestamp = now();

          setState((current) => {
            const updated = updateShellSessionJob(current, nextJob.id, (job) =>
              transitionShellJob(job, nextState),
            );

            return appendShellLogEvent(
              updated,
              createShellJobStateLogEvent(createEventId(), timestamp, {
                id: nextJob.id,
                state: nextState,
              }),
            );
          });
        },
        onTiming: async (stage, durationMs) => {
          setState((current) =>
            updateShellSessionJob(current, nextJob.id, (job) =>
              recordShellJobTiming(job, stage, durationMs),
            ),
          );
        },
      });

      const timestamp = now();
      setState((current) => {
        let completedJob: ShellJob | null = null;
        const updated = updateShellSessionJob(current, nextJob.id, (job) => {
          const nextCompletedJob = completeShellJob(job, result);
          completedJob = nextCompletedJob;
          return nextCompletedJob;
        });

        return completedJob
          ? appendShellLogEvent(
              updated,
              createShellJobResultLogEvent(createEventId(), timestamp, completedJob),
            )
          : updated;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const timestamp = now();

      setState((current) => {
        let failedJob: ShellJob | null = null;
        const updated = updateShellSessionJob(current, nextJob.id, (job) => {
          const nextFailedJob = failShellJob(job, message);
          failedJob = nextFailedJob;
          return nextFailedJob;
        });

        return failedJob
          ? appendShellLogEvent(
              updated,
              createShellJobErrorLogEvent(createEventId(), timestamp, failedJob),
            )
          : updated;
      });
    } finally {
      processing = false;
      setState((current) => setActiveShellJobId(current, null));
      queueMicrotask(() => {
        void processNextQueuedJob();
      });
    }
  };

  return {
    enqueue(input: string): ShellJob {
      const job = createShellJob({
        id: createJobId(),
        input,
        createdAt: now(),
        kind: parseShellCommand(input).name === null ? "capture" : "command",
      });

      setState((current) =>
        appendShellLogEvent(
          addShellJob(current, job),
          createQueuedShellLogEvent(createEventId(), job.createdAt, job),
        ),
      );

      queueMicrotask(() => {
        void processNextQueuedJob();
      });

      return job;
    },
    appendLog(kind: ShellLogKind, message: string): void {
      setState((current) =>
        appendShellLogEvent(current, {
          id: createEventId(),
          timestamp: now(),
          kind,
          message,
        }),
      );
    },
    getState(): ShellSessionState {
      return state;
    },
    subscribe(listener: (state: ShellSessionState) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    toggleSubmitMode(): void {
      setState((current) => setShellSubmitMode(current, toggleShellSubmitMode(current.submitMode)));
    },
  };
}
