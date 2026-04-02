import { captureNoteWithHooks } from "../note/upsert.js";
import type { CaptureHooks } from "../note/capture-pipeline.js";
import type { AddOutcome, GateConfig } from "../types.js";
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

  const processCommandJob = async (job: ShellJob): Promise<void> => {
    const timestamp = now();
    const command = parseShellCommand(job.input);

    setState((current) =>
      appendShellLogEvent(current, {
        id: createEventId(),
        timestamp,
        kind: "command",
        message: command.raw,
      }),
    );

    if (command.name === "help") {
      for (const line of getShellHelpLines()) {
        setState((current) =>
          appendShellLogEvent(current, {
            id: createEventId(),
            timestamp: now(),
            kind: "system",
            message: line,
          }),
        );
      }
    }

    if (command.name === "queue") {
      for (const line of getShellQueueInspectionLines(state)) {
        setState((current) =>
          appendShellLogEvent(current, {
            id: createEventId(),
            timestamp: now(),
            kind: "system",
            message: line,
          }),
        );
      }
    }

    if (command.name === "quit") {
      options.requestQuit?.();
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
