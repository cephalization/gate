import type { CaptureStage } from "../note/capture-pipeline.js";
import type { AddOutcome } from "../types.js";
import type { ShellJob, ShellJobState } from "./types.js";

export interface CreateShellJobInput {
  id: string;
  input: string;
  createdAt: string;
  kind?: ShellJob["kind"];
}

export function createShellJob({
  id,
  input,
  createdAt,
  kind = "capture",
}: CreateShellJobInput): ShellJob {
  return {
    id,
    createdAt,
    input,
    kind,
    source: "gate-shell",
    state: "queued",
    timings: {},
  };
}

export function enqueueShellJob(queue: ShellJob[], job: ShellJob): ShellJob[] {
  return [...queue, job];
}

export function getNextQueuedShellJob(queue: ShellJob[]): ShellJob | null {
  return (
    queue.find((job) => job.state === "queued" && job.kind === "command") ??
    queue.find((job) => job.state === "queued" && job.kind === "capture") ??
    null
  );
}

export function updateShellJob(
  queue: ShellJob[],
  jobId: string,
  update: (job: ShellJob) => ShellJob,
): ShellJob[] {
  return queue.map((job) => (job.id === jobId ? update(job) : job));
}

export function transitionShellJob(job: ShellJob, state: ShellJobState): ShellJob {
  return {
    ...job,
    state,
  };
}

export function recordShellJobTiming(
  job: ShellJob,
  stage: CaptureStage,
  durationMs: number,
): ShellJob {
  return {
    ...job,
    timings: {
      ...job.timings,
      [stage]: durationMs,
    },
  };
}

export function completeShellJob(job: ShellJob, result?: AddOutcome): ShellJob {
  return {
    ...job,
    state: "done",
    result,
    error: undefined,
  };
}

export function failShellJob(job: ShellJob, error: string): ShellJob {
  return {
    ...job,
    state: "failed",
    error,
  };
}

export function getShellJobTotalDuration(job: Pick<ShellJob, "timings">): number {
  return Object.values(job.timings).reduce((total, value) => total + value, 0);
}
