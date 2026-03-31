export function formatDuration(startTime: number): string {
  return formatDurationMs(Date.now() - startTime);
}

export function formatDurationMs(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  return `${(durationMs / 1000).toFixed(2)}s`;
}

export function formatTimingBreakdown(timings: Record<string, number>): string {
  return Object.entries(timings)
    .map(([label, duration]) => `${label} ${formatDurationMs(duration)}`)
    .join(", ");
}
