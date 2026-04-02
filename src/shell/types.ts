import type { CaptureStage } from "../note/capture-pipeline.js";
import type { AddOutcome } from "../types.js";

export const SHELL_JOB_STATES = [
  "queued",
  "refreshing",
  "searching",
  "filtering",
  "classifying",
  "writing",
  "reindexing",
  "done",
  "failed",
] as const;

export const SHELL_JOB_KINDS = ["capture", "command"] as const;

export type ShellJobKind = (typeof SHELL_JOB_KINDS)[number];

export type ShellJobState = (typeof SHELL_JOB_STATES)[number];

export const SHELL_SUBMIT_MODES = ["enter-submit", "shift-enter-submit"] as const;

export type ShellSubmitMode = (typeof SHELL_SUBMIT_MODES)[number];

export const SHELL_LOG_KINDS = ["system", "job", "command", "result", "error"] as const;

export type ShellLogKind = (typeof SHELL_LOG_KINDS)[number];

export type ShellJobTimings = Partial<Record<CaptureStage, number>>;

export interface ShellJob {
  id: string;
  createdAt: string;
  input: string;
  kind: ShellJobKind;
  source: "gate-shell";
  state: ShellJobState;
  result?: AddOutcome;
  error?: string;
  timings: ShellJobTimings;
}

export interface ShellLogEvent {
  id: string;
  timestamp: string;
  kind: ShellLogKind;
  message: string;
}

export interface ShellSessionStats {
  completed: number;
  failed: number;
  averageDurationMs: number;
}

export interface ShellSessionState {
  queue: ShellJob[];
  activeJobId: string | null;
  log: ShellLogEvent[];
  stats: ShellSessionStats;
  submitMode: ShellSubmitMode;
}
