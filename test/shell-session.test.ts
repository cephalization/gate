import assert from "node:assert/strict";
import test from "node:test";

import {
  createQueuedShellLogEvent,
  createShellJobErrorLogEvent,
  createShellJobResultLogEvent,
} from "../src/shell/events.js";
import {
  completeShellJob,
  createShellJob,
  enqueueShellJob,
  failShellJob,
  getNextQueuedShellJob,
  getShellJobTotalDuration,
  recordShellJobTiming,
  transitionShellJob,
  updateShellJob,
} from "../src/shell/queue.js";
import {
  addShellJob,
  appendShellLogEvent,
  calculateShellSessionStats,
  createShellSessionState,
  getShellQueueInspectionLines,
  getShellQueueDepth,
  getShellWorkerState,
  hasPendingShellWork,
  setActiveShellJobId,
  toggleShellSubmitMode,
  updateShellSessionJob,
} from "../src/shell/session.js";
import type { AddOutcome } from "../src/types.js";

function createFinishedOutcome(action: "created" | "merged", title: string): AddOutcome {
  if (action === "created") {
    return {
      success: true,
      action,
      title,
      filePath: `/tmp/${title}.md`,
      noteId: `${title}-id`,
      aiEnriched: false,
      related: [],
      timings: {},
    };
  }

  return {
    success: true,
    action,
    title,
    filePath: `/tmp/${title}.md`,
    noteId: `${title}-id`,
    aiEnriched: false,
    mergedIntoTitle: title,
    timings: {},
  };
}

test("queue helpers create and update shell jobs immutably", () => {
  const created = createShellJob({
    id: "101",
    input: "follow up on retry strategy",
    createdAt: "2026-04-02T00:00:00.000Z",
  });

  assert.equal(created.state, "queued");
  assert.equal(created.kind, "capture");
  assert.equal(created.source, "gate-shell");
  assert.deepEqual(created.timings, {});

  const queue = enqueueShellJob([], created);
  assert.equal(getNextQueuedShellJob(queue)?.id, "101");

  const updatedQueue = updateShellJob(queue, "101", (job) =>
    recordShellJobTiming(transitionShellJob(job, "searching"), "search", 2800),
  );

  assert.equal(queue[0]?.state, "queued");
  assert.equal(updatedQueue[0]?.state, "searching");
  assert.equal(updatedQueue[0]?.timings.search, 2800);
});

test("queue picks queued slash commands before later capture jobs", () => {
  const firstCapture = createShellJob({
    id: "201",
    input: "first capture",
    createdAt: "2026-04-02T00:00:00.000Z",
  });
  const slashCommand = createShellJob({
    id: "202",
    input: "/help",
    createdAt: "2026-04-02T00:00:01.000Z",
    kind: "command",
  });
  const secondCapture = createShellJob({
    id: "203",
    input: "second capture",
    createdAt: "2026-04-02T00:00:02.000Z",
  });

  const nextJob = getNextQueuedShellJob([firstCapture, slashCommand, secondCapture]);
  assert.equal(nextJob?.id, "202");
  assert.equal(nextJob?.kind, "command");
});

test("job helpers capture completion, failures, and total duration", () => {
  const job = recordShellJobTiming(
    recordShellJobTiming(
      createShellJob({
        id: "102",
        input: "timing output sanity check",
        createdAt: "2026-04-02T00:00:00.000Z",
      }),
      "search",
      2800,
    ),
    "write",
    900,
  );

  const completed = completeShellJob(job, createFinishedOutcome("created", "billing-retry"));
  assert.equal(completed.state, "done");
  assert.equal(getShellJobTotalDuration(completed), 3700);

  const failed = failShellJob(completed, "index refresh failed");
  assert.equal(failed.state, "failed");
  assert.equal(failed.error, "index refresh failed");
});

test("session helpers derive stats, queue depth, worker state, and submit mode", () => {
  const queued = createShellJob({
    id: "103",
    input: "queued capture",
    createdAt: "2026-04-02T00:00:00.000Z",
  });
  const completed = completeShellJob(
    recordShellJobTiming(
      recordShellJobTiming(
        createShellJob({
          id: "104",
          input: "finished capture",
          createdAt: "2026-04-02T00:00:01.000Z",
        }),
        "search",
        2000,
      ),
      "write",
      1000,
    ),
    createFinishedOutcome("merged", "finished-note"),
  );
  const failed = failShellJob(
    recordShellJobTiming(
      createShellJob({
        id: "105",
        input: "broken capture",
        createdAt: "2026-04-02T00:00:02.000Z",
      }),
      "filter",
      250,
    ),
    "classification failed",
  );
  const command = completeShellJob(
    createShellJob({
      id: "106",
      input: "/help",
      createdAt: "2026-04-02T00:00:03.000Z",
      kind: "command",
    }),
  );

  let state = createShellSessionState();
  state = addShellJob(state, queued);
  state = addShellJob(state, completed);
  state = addShellJob(state, failed);
  state = addShellJob(state, command);

  assert.deepEqual(calculateShellSessionStats(state.queue), {
    completed: 1,
    failed: 1,
    averageDurationMs: 3000,
  });
  assert.equal(getShellQueueDepth(state), 1);
  assert.equal(hasPendingShellWork(state), true);
  assert.equal(getShellWorkerState(state), "idle");
  assert.equal(toggleShellSubmitMode(state.submitMode), "shift-enter-submit");

  state = setActiveShellJobId(state, "103");
  assert.equal(getShellWorkerState(state), "busy");
  assert.equal(getShellQueueDepth(state), 0);
  assert.equal(hasPendingShellWork(state), true);

  const searchingState = updateShellSessionJob(state, "103", (job) =>
    transitionShellJob(job, "searching"),
  );
  assert.equal(searchingState.queue.find((job) => job.id === "103")?.state, "searching");
  assert.equal(hasPendingShellWork(createShellSessionState()), false);
});

test("event helpers emit stable user-facing log lines", () => {
  const queued = createShellJob({
    id: "106",
    input: "quoted input",
    createdAt: "2026-04-02T00:00:00.000Z",
  });
  const queuedEvent = createQueuedShellLogEvent("evt-1", queued.createdAt, queued);
  assert.deepEqual(queuedEvent, {
    id: "evt-1",
    timestamp: queued.createdAt,
    kind: "job",
    message: 'queued #106 "quoted input"',
  });

  const completed = completeShellJob(
    recordShellJobTiming(queued, "write", 900),
    createFinishedOutcome("created", "quoted-note"),
  );
  const resultEvent = createShellJobResultLogEvent("evt-2", queued.createdAt, completed);
  assert.equal(resultEvent.kind, "result");
  assert.equal(resultEvent.message, "done #106 created: quoted-note 900ms [write 900ms]");

  const errorEvent = createShellJobErrorLogEvent(
    "evt-3",
    queued.createdAt,
    failShellJob(queued, "write failed"),
  );
  const stateWithLog = appendShellLogEvent(createShellSessionState(), errorEvent);
  assert.equal(stateWithLog.log[0]?.message, "failed #106 write failed");
});

test("queue inspection lines summarize active, queued, recent, and counts", () => {
  const done = completeShellJob(
    recordShellJobTiming(
      recordShellJobTiming(
        createShellJob({
          id: "301",
          input: "finished capture",
          createdAt: "2026-04-02T00:00:00.000Z",
        }),
        "search",
        5,
      ),
      "write",
      7,
    ),
    createFinishedOutcome("created", "finished-capture"),
  );
  const failed = failShellJob(
    createShellJob({
      id: "302",
      input: "failed capture",
      createdAt: "2026-04-02T00:00:01.000Z",
    }),
    "write failed",
  );
  const active = recordShellJobTiming(
    transitionShellJob(
      createShellJob({
        id: "303",
        input: "active capture",
        createdAt: "2026-04-02T00:00:02.000Z",
      }),
      "searching",
    ),
    "refresh",
    3,
  );
  const queued = createShellJob({
    id: "304",
    input: "queued capture",
    createdAt: "2026-04-02T00:00:03.000Z",
  });
  const command = completeShellJob(
    createShellJob({
      id: "305",
      input: "/help",
      createdAt: "2026-04-02T00:00:04.000Z",
      kind: "command",
    }),
  );

  const lines = getShellQueueInspectionLines({
    queue: [done, failed, active, queued, command],
    activeJobId: "303",
  });

  assert.deepEqual(lines, [
    "queue counts queued:1 searching:1 done:1 failed:1",
    'queue active #303 searching "active capture"',
    'queue queued #304 "queued capture"',
    "queue recent #302 failed write failed",
    "queue recent #301 created: finished-capture 12ms [search 5ms, write 7ms]",
  ]);
});
