import assert from "node:assert/strict";
import test from "node:test";
import { createShellWorker } from "../src/shell/worker.js";

const config = {
  vaultPath: "/tmp/gate-shell-worker-test-vault",
  defaultFolder: "Inbox",
  ai: {
    enabled: true,
    provider: "openai",
    model: "gpt-4.1-mini",
    temperature: 0.1,
    maxTokens: 600,
  },
  merge: {
    autoThreshold: 0.85,
    suggestThreshold: 0.7,
  },
};

function createSuccessOutcome(title: string) {
  return {
    success: true,
    action: "created" as const,
    title,
    filePath: `/tmp/${title}.md`,
    noteId: `${title}-id`,
    aiEnriched: false,
    related: [],
    timings: {},
  };
}

function createDeferred() {
  let resolve: () => void;
  let reject: (error?: unknown) => void;
  const promise = new Promise<void>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve: resolve!, reject: reject! };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function waitFor<T>(assertion: () => T | null | false, timeoutMs = 2000): Promise<T> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const result = assertion();
    if (result) {
      return result;
    }

    await flush();
  }

  throw new Error("Timed out waiting for condition");
}

test("shell worker processes queued jobs one at a time and records stage timings", async () => {
  const started: string[] = [];
  const firstJob = createDeferred();

  const worker = createShellWorker({
    config,
    createJobId: (() => {
      let nextId = 1;
      return () => String(nextId++);
    })(),
    now: (() => {
      let nextTick = 0;
      return () => `2026-04-02T00:00:0${nextTick++}.000Z`;
    })(),
    capture: async (_config, text, _source, hooks = {}) => {
      started.push(text);
      await hooks.onStageChange?.("refresh");
      await hooks.onTiming?.("refresh", 5);

      if (text === "first capture") {
        await firstJob.promise;
      }

      await hooks.onStageChange?.("write");
      await hooks.onTiming?.("write", 11);
      await hooks.onStageChange?.("reindex");
      await hooks.onTiming?.("reindex", 7);
      return createSuccessOutcome(text.split(" ").join("-"));
    },
  });

  worker.enqueue("first capture");
  worker.enqueue("second capture");

  await waitFor(() => (worker.getState().activeJobId === "1" ? true : null));

  let state = worker.getState();
  assert.deepEqual(started, ["first capture"]);
  assert.equal(state.queue[0]?.state, "refreshing");
  assert.equal(state.queue[0]?.timings.refresh, 5);
  assert.equal(state.queue[1]?.state, "queued");

  firstJob.resolve();

  await waitFor(() => (worker.getState().stats.completed === 2 ? true : null));

  state = worker.getState();
  assert.deepEqual(started, ["first capture", "second capture"]);
  assert.equal(state.activeJobId, null);
  assert.equal(state.queue[0]?.state, "done");
  assert.equal(state.queue[0]?.timings.write, 11);
  assert.equal(state.queue[0]?.timings.reindex, 7);
  assert.equal(state.queue[1]?.state, "done");
  assert.equal(state.stats.failed, 0);
  assert.ok(state.log.some((event) => event.message === "refreshing #1"));
  assert.ok(
    state.log.some(
      (event) =>
        event.message ===
        "done #2 created: second-capture 23ms [refresh 5ms, write 11ms, reindex 7ms]",
    ),
  );
});

test("shell worker logs failures and continues processing later jobs", async () => {
  const worker = createShellWorker({
    config,
    now: (() => {
      let nextTick = 0;
      return () => `2026-04-02T00:01:0${nextTick++}.000Z`;
    })(),
    capture: async (_config, text, _source, hooks = {}) => {
      await hooks.onStageChange?.("search");
      await hooks.onTiming?.("search", 3);

      if (text === "broken capture") {
        throw new Error("search failed");
      }

      await hooks.onStageChange?.("write");
      await hooks.onTiming?.("write", 2);
      return createSuccessOutcome("recovered-note");
    },
  });

  worker.enqueue("broken capture");
  worker.enqueue("healthy capture");

  await waitFor(() => {
    const state = worker.getState();
    return state.stats.failed === 1 && state.stats.completed === 1 && state.activeJobId === null
      ? true
      : null;
  });

  const state = worker.getState();
  assert.equal(state.queue[0]?.state, "failed");
  assert.equal(state.queue[0]?.error, "search failed");
  assert.equal(state.queue[1]?.state, "done");
  assert.ok(
    state.log.some((event) => event.message === "failed #1 search failed 3ms [search 3ms]"),
  );
  assert.ok(
    state.log.some(
      (event) => event.message === "done #2 created: recovered-note 5ms [search 3ms, write 2ms]",
    ),
  );
});

test("shell worker prioritizes queued slash commands ahead of later captures", async () => {
  const started: string[] = [];
  const firstJob = createDeferred();

  const worker = createShellWorker({
    config,
    createJobId: (() => {
      let nextId = 1;
      return () => String(nextId++);
    })(),
    now: (() => {
      let nextTick = 0;
      return () => `2026-04-02T00:02:0${nextTick++}.000Z`;
    })(),
    capture: async (_config, text, _source, hooks = {}) => {
      started.push(text);
      await hooks.onStageChange?.("refresh");

      if (text === "first capture") {
        await firstJob.promise;
      }

      await hooks.onStageChange?.("write");
      await hooks.onTiming?.("write", 2);
      return createSuccessOutcome(text.split(" ").join("-"));
    },
  });

  worker.enqueue("first capture");

  await waitFor(() => (worker.getState().activeJobId === "1" ? true : null));

  worker.enqueue("second capture");
  worker.enqueue("/help");
  firstJob.resolve();

  await waitFor(() => {
    const state = worker.getState();
    return state.queue.every((job) => job.state === "done") ? true : null;
  });

  const state = worker.getState();
  assert.deepEqual(started, ["first capture", "second capture"]);
  assert.equal(state.queue[1]?.kind, "capture");
  assert.equal(state.queue[2]?.kind, "command");
  assert.ok(state.log.some((event) => event.message === "/help"));
  assert.ok(state.log.some((event) => event.message === "commands:"));
  assert.ok(state.log.some((event) => event.message === "/help show available shell commands"));
});

test("shell worker runs queued quit commands through the injected quit handler", async () => {
  let quitRequests = 0;

  const worker = createShellWorker({
    config,
    requestQuit: () => {
      quitRequests += 1;
    },
  });

  worker.enqueue("/quit");

  await waitFor(() => (worker.getState().queue[0]?.state === "done" ? true : null));

  const state = worker.getState();
  assert.equal(quitRequests, 1);
  assert.equal(state.queue[0]?.kind, "command");
  assert.ok(state.log.some((event) => event.message === "/quit"));
});

test("shell worker renders compact search and related lines in the activity log", async () => {
  const worker = createShellWorker({
    config,
    createJobId: (() => {
      let nextId = 1;
      return () => String(nextId++);
    })(),
    search: async (_config, query) => [
      {
        title: `search match for ${query}`,
        score: 0.91,
        filePath: "/tmp/gate-shell-worker-test-vault/Inbox/search-match.md",
        body: "",
      },
    ],
    related: async (_config, query) => [
      {
        title: `related match for ${query}`,
        score: 0.84,
        rationale: "QMD semantic match 84.0%",
        filePath: "/tmp/gate-shell-worker-test-vault/Inbox/related-match.md",
      },
    ],
  });

  worker.enqueue("/search gate shell");
  worker.enqueue("/related gate shell");

  await waitFor(() => {
    const state = worker.getState();
    return state.queue.every((job) => job.state === "done") ? true : null;
  });

  const messages = worker.getState().log.map((event) => event.message);
  assert.ok(messages.includes("/search gate shell"));
  assert.ok(messages.includes("search 91.0% search match for gate shell - Inbox/search-match.md"));
  assert.ok(messages.includes("/related gate shell"));
  assert.ok(
    messages.includes("related 84.0% related match for gate shell - Inbox/related-match.md"),
  );
});

test("shell worker fails invalid slash commands instead of treating them as captures", async () => {
  let captureCalls = 0;

  const worker = createShellWorker({
    config,
    capture: async () => {
      captureCalls += 1;
      return createSuccessOutcome("unexpected-capture");
    },
  });

  worker.enqueue("/search");

  await waitFor(() => (worker.getState().queue[0]?.state === "failed" ? true : null));

  const state = worker.getState();
  assert.equal(captureCalls, 0);
  assert.equal(state.queue[0]?.kind, "command");
  assert.equal(state.queue[0]?.error, "missing query for /search");
  assert.ok(state.log.some((event) => event.message === "/search"));
  assert.ok(state.log.some((event) => event.message === "failed #1 missing query for /search"));
});

test("shell worker renders queue inspection lines from session state", async () => {
  const firstJob = createDeferred();

  const worker = createShellWorker({
    config,
    createJobId: (() => {
      let nextId = 1;
      return () => String(nextId++);
    })(),
    now: (() => {
      let nextTick = 0;
      return () => `2026-04-02T00:03:0${nextTick++}.000Z`;
    })(),
    capture: async (_config, text, _source, hooks = {}) => {
      await hooks.onStageChange?.("refresh");
      await hooks.onTiming?.("refresh", 5);

      if (text === "first capture") {
        await firstJob.promise;
      }

      await hooks.onStageChange?.("write");
      await hooks.onTiming?.("write", 11);
      await hooks.onStageChange?.("reindex");
      await hooks.onTiming?.("reindex", 7);
      return createSuccessOutcome(text.split(" ").join("-"));
    },
  });

  worker.enqueue("first capture");

  await waitFor(() => (worker.getState().activeJobId === "1" ? true : null));

  worker.enqueue("second capture");
  worker.enqueue("/queue");
  firstJob.resolve();

  await waitFor(() => {
    const state = worker.getState();
    return state.queue.every((job) => job.state === "done") ? true : null;
  });

  const messages = worker.getState().log.map((event) => event.message);
  assert.ok(messages.includes("/queue"));
  assert.ok(messages.includes("queue counts queued:1 done:1"));
  assert.ok(messages.includes("queue active idle"));
  assert.ok(messages.includes('queue queued #2 "second capture"'));
  assert.ok(
    messages.includes(
      "queue recent #1 created: first-capture 23ms [refresh 5ms, write 11ms, reindex 7ms]",
    ),
  );
});
