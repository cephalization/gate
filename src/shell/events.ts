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
  const action = job.result?.action ?? "completed";
  const title = job.result?.title ?? "unknown";
  const durationMs = getShellJobTotalDuration(job);

  return createShellLogEvent({
    id,
    timestamp,
    kind: "result",
    message: `done #${job.id} ${action}: ${title} ${durationMs}ms`,
  });
}

export function createShellJobErrorLogEvent(
  id: string,
  timestamp: string,
  job: Pick<ShellJob, "id" | "error">,
): ShellLogEvent {
  return createShellLogEvent({
    id,
    timestamp,
    kind: "error",
    message: `failed #${job.id} ${job.error ?? "Unknown error"}`,
  });
}
