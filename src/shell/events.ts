import { formatDurationMs, formatTimingBreakdown } from "../timing.js";
import { getShellJobTotalDuration } from "./queue.js";
import type { ShellJob, ShellLogEvent, ShellLogKind } from "./types.js";

export interface CreateShellLogEventInput {
  id: string;
  timestamp: string;
  kind: ShellLogKind;
  message: string;
}

export function createShellLogEvent({
  id,
  timestamp,
  kind,
  message,
}: CreateShellLogEventInput): ShellLogEvent {
  return { id, timestamp, kind, message };
}

export function createQueuedShellLogEvent(
  id: string,
  timestamp: string,
  job: ShellJob,
): ShellLogEvent {
  return createShellLogEvent({
    id,
    timestamp,
    kind: "job",
    message: `queued #${job.id} ${JSON.stringify(job.input)}`,
  });
}

export function createShellJobStateLogEvent(
  id: string,
  timestamp: string,
  job: Pick<ShellJob, "id" | "state">,
): ShellLogEvent {
  return createShellLogEvent({
    id,
    timestamp,
    kind: "job",
    message: `${job.state} #${job.id}`,
  });
}

export function createShellJobResultLogEvent(
  id: string,
  timestamp: string,
  job: Pick<ShellJob, "id" | "timings" | "result">,
): ShellLogEvent {
  return createShellLogEvent({
    id,
    timestamp,
    kind: "result",
    message: formatShellJobResultMessage(job),
  });
}

export function createShellJobErrorLogEvent(
  id: string,
  timestamp: string,
  job: Pick<ShellJob, "id" | "error" | "timings">,
): ShellLogEvent {
  return createShellLogEvent({
    id,
    timestamp,
    kind: "error",
    message: formatShellJobFailureMessage(job),
  });
}

export function formatShellJobResultMessage(
  job: Pick<ShellJob, "id" | "timings" | "result">,
): string {
  const action = job.result?.action ?? "completed";
  const title = job.result?.title ?? "unknown";
  return `done #${job.id} ${action}: ${title}${formatShellJobTimingSummary(job.timings)}`;
}

export function formatShellJobFailureMessage(
  job: Pick<ShellJob, "id" | "error" | "timings">,
): string {
  return `failed #${job.id} ${job.error ?? "Unknown error"}${formatShellJobTimingSummary(job.timings)}`;
}

export function formatShellJobTimingSummary(timings: ShellJob["timings"]): string {
  const durationMs = getShellJobTotalDuration({ timings });
  const timingEntries = Object.entries(timings);

  if (durationMs === 0) {
    return "";
  }

  if (timingEntries.length === 0) {
    return ` ${formatDurationMs(durationMs)}`;
  }

  return ` ${formatDurationMs(durationMs)} [${formatTimingBreakdown(timings)}]`;
}
