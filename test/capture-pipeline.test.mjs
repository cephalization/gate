import assert from "node:assert/strict";
import test from "node:test";
import { runCapturePipeline } from "../src/note/capture-pipeline.ts";

const config = {
  vaultPath: "/tmp/gate-test-vault",
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

function createMatch(score, filePath = "/tmp/existing.md") {
  return {
    title: "Existing note",
    score,
    filePath,
    body: "existing body",
  };
}

test("runCapturePipeline emits ordered stage hooks for new note creation", async () => {
  const stageChanges = [];
  const timings = [];

  const result = await runCapturePipeline(
    config,
    "new capture",
    "gate-add",
    {
      refreshStore: async () => {},
      searchVault: async () => [createMatch(0.95)],
      isMergeEligible: async () => false,
      classifyCapture: async () => ({ decision: "new", confidence: 0.2, reason: "unused" }),
      createNote: async (_text, _source, matches) => {
        assert.equal(matches.length, 1);
        return {
          title: "Created note",
          noteId: "created-id",
          filePath: "/tmp/created.md",
          aiEnriched: false,
          related: ["Existing note"],
        };
      },
      mergeIntoNote: async () => {
        throw new Error("merge should not run");
      },
      reindex: async () => {},
    },
    {
      onStageChange: async (stage) => {
        stageChanges.push(stage);
      },
      onTiming: async (stage, durationMs) => {
        timings.push([stage, durationMs]);
      },
    },
  );

  assert.deepEqual(stageChanges, ["refresh", "search", "filter", "write", "reindex"]);
  assert.deepEqual(
    timings.map(([stage]) => stage),
    ["refresh", "search", "filter", "write", "reindex"],
  );
  assert.ok(timings.every(([, durationMs]) => durationMs >= 0));
  assert.equal(result.action, "created");
  assert.deepEqual(result.related, ["Existing note"]);
  assert.equal("classify" in result.timings, false);
});

test("runCapturePipeline includes classify stage before suggested merge", async () => {
  const stageChanges = [];

  const result = await runCapturePipeline(
    config,
    "follow-up capture",
    "gate-add",
    {
      refreshStore: async () => {},
      searchVault: async () => [createMatch(0.75)],
      isMergeEligible: async () => true,
      classifyCapture: async (text, match) => {
        assert.equal(text, "follow-up capture");
        assert.equal(match.title, "Existing note");
        return { decision: "merge", confidence: 0.91, reason: "clear continuation" };
      },
      createNote: async () => {
        throw new Error("create should not run");
      },
      mergeIntoNote: async (match, text) => {
        assert.equal(match.title, "Existing note");
        assert.equal(text, "follow-up capture");
        return {
          title: "Existing note",
          noteId: "merged-id",
          filePath: "/tmp/existing.md",
          aiEnriched: true,
        };
      },
      reindex: async () => {},
    },
    {
      onStageChange: async (stage) => {
        stageChanges.push(stage);
      },
    },
  );

  assert.deepEqual(stageChanges, ["refresh", "search", "filter", "classify", "write", "reindex"]);
  assert.equal(result.action, "merged");
  assert.equal(result.mergedIntoTitle, "Existing note");
  assert.ok(typeof result.timings.classify === "number");
});
