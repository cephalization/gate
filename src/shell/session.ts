import { enqueueShellJob, getShellJobTotalDuration, updateShellJob } from "./queue.js";
import {
  SHELL_JOB_STATES,
  type ShellJob,
  ShellLogEvent,
  ShellSessionState,
  ShellSessionStats,
  ShellSubmitMode,
} from "./types.js";

const SHELL_QUEUE_DISPLAY_LIMIT = 3;

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

export function hasPendingShellWork(
  state: Pick<ShellSessionState, "queue" | "activeJobId">,
): boolean {
  return state.activeJobId !== null || getShellQueueDepth(state) > 0;
}

export function getShellQueueInspectionLines(
  state: Pick<ShellSessionState, "queue" | "activeJobId">,
): string[] {
  const captureJobs = state.queue.filter((job) => job.kind === "capture");
  const activeCaptureJob =
    state.activeJobId === null
      ? null
      : (captureJobs.find((job) => job.id === state.activeJobId) ?? null);
  const queuedCaptureJobs = captureJobs.filter(
    (job) => job.state === "queued" && job.id !== state.activeJobId,
  );
  const finishedCaptureJobs = captureJobs
    .filter((job) => job.state === "done" || job.state === "failed")
    .slice(-SHELL_QUEUE_DISPLAY_LIMIT)
    .reverse();
  const stateCounts = new Map<string, number>();

  for (const job of captureJobs) {
    stateCounts.set(job.state, (stateCounts.get(job.state) ?? 0) + 1);
  }

  const countsSummary = SHELL_JOB_STATES.filter(
    (shellJobState) => (stateCounts.get(shellJobState) ?? 0) > 0,
  )
    .map((shellJobState) => `${shellJobState}:${stateCounts.get(shellJobState)}`)
    .join(" ");
  const lines = [
    countsSummary.length > 0 ? `queue counts ${countsSummary}` : "queue counts empty",
    activeCaptureJob
      ? `queue active #${activeCaptureJob.id} ${activeCaptureJob.state} ${JSON.stringify(activeCaptureJob.input)}`
      : "queue active idle",
  ];

  if (queuedCaptureJobs.length === 0) {
    lines.push("queue queued none");
  } else {
    for (const job of queuedCaptureJobs.slice(0, SHELL_QUEUE_DISPLAY_LIMIT)) {
      lines.push(`queue queued #${job.id} ${JSON.stringify(job.input)}`);
    }

    const remainingQueuedCount = queuedCaptureJobs.length - SHELL_QUEUE_DISPLAY_LIMIT;
    if (remainingQueuedCount > 0) {
      lines.push(`queue queued +${remainingQueuedCount} more`);
    }
  }

  if (finishedCaptureJobs.length === 0) {
    lines.push("queue recent none");
  } else {
    for (const job of finishedCaptureJobs) {
      lines.push(formatShellQueueRecentLine(job));
    }
  }

  return lines;
}

export function calculateShellSessionStats(queue: ShellJob[]): ShellSessionStats {
  const captureJobs = queue.filter((job) => job.kind === "capture");
  const completedJobs = captureJobs.filter((job) => job.state === "done");
  const failedJobs = captureJobs.filter((job) => job.state === "failed");
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

function formatShellQueueRecentLine(job: ShellJob): string {
  if (job.state === "failed") {
    return `queue recent #${job.id} failed ${job.error ?? "Unknown error"}`;
  }

  const action = job.result?.action ?? "completed";
  const title = job.result?.title ?? "unknown";
  return `queue recent #${job.id} ${action}: ${title} ${getShellJobTotalDuration(job)}ms`;
}
