import { enqueueShellJob, getShellJobTotalDuration, updateShellJob } from "./queue.js";
import type {
  ShellJob,
  ShellLogEvent,
  ShellSessionState,
  ShellSessionStats,
  ShellSubmitMode,
} from "./types.js";

export function createShellSessionState(
  submitMode: ShellSubmitMode = "enter-submit",
): ShellSessionState {
  return {
    queue: [],
    activeJobId: null,
    log: [],
    stats: {
      completed: 0,
      failed: 0,
      averageDurationMs: 0,
    },
    submitMode,
  };
}

export function toggleShellSubmitMode(mode: ShellSubmitMode): ShellSubmitMode {
  return mode === "enter-submit" ? "shift-enter-submit" : "enter-submit";
}

export function setShellSubmitMode(
  state: ShellSessionState,
  submitMode: ShellSubmitMode,
): ShellSessionState {
  return {
    ...state,
    submitMode,
  };
}

export function appendShellLogEvent(
  state: ShellSessionState,
  event: ShellLogEvent,
): ShellSessionState {
  return {
    ...state,
    log: [...state.log, event],
  };
}

export function addShellJob(state: ShellSessionState, job: ShellJob): ShellSessionState {
  return syncShellSessionStats({
    ...state,
    queue: enqueueShellJob(state.queue, job),
  });
}

export function updateShellSessionJob(
  state: ShellSessionState,
  jobId: string,
  update: (job: ShellJob) => ShellJob,
): ShellSessionState {
  return syncShellSessionStats({
    ...state,
    queue: updateShellJob(state.queue, jobId, update),
  });
}

export function setActiveShellJobId(
  state: ShellSessionState,
  activeJobId: string | null,
): ShellSessionState {
  return {
    ...state,
    activeJobId,
  };
}

export function getShellQueueDepth(
  state: Pick<ShellSessionState, "queue" | "activeJobId">,
): number {
  return state.queue.filter((job) => job.state === "queued" && job.id !== state.activeJobId).length;
}

export function getShellWorkerState(
  state: Pick<ShellSessionState, "activeJobId">,
): "idle" | "busy" {
  return state.activeJobId ? "busy" : "idle";
}

export function calculateShellSessionStats(queue: ShellJob[]): ShellSessionStats {
  const completedJobs = queue.filter((job) => job.state === "done");
  const failedJobs = queue.filter((job) => job.state === "failed");
  const totalDurationMs = completedJobs.reduce(
    (total, job) => total + getShellJobTotalDuration(job),
    0,
  );

  return {
    completed: completedJobs.length,
    failed: failedJobs.length,
    averageDurationMs: completedJobs.length === 0 ? 0 : totalDurationMs / completedJobs.length,
  };
}

export function syncShellSessionStats(state: ShellSessionState): ShellSessionState {
  return {
    ...state,
    stats: calculateShellSessionStats(state.queue),
  };
}
