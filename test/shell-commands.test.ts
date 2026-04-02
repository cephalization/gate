import assert from "node:assert/strict";
import test from "node:test";

import {
  getShellHelpLines,
  parseShellCommand,
  resolveShellQuitRequest,
} from "../src/shell/commands.js";

test("shell command parser recognizes supported slash commands", () => {
  assert.deepEqual(parseShellCommand(" /help "), { name: "help", raw: "/help" });
  assert.deepEqual(parseShellCommand("/quit"), { name: "quit", raw: "/quit" });
  assert.deepEqual(parseShellCommand("/queue"), { name: "queue", raw: "/queue" });
  assert.deepEqual(parseShellCommand("/search gate timing"), {
    name: "search",
    raw: "/search gate timing",
    query: "gate timing",
  });
  assert.deepEqual(parseShellCommand("/related queue worker"), {
    name: "related",
    raw: "/related queue worker",
    query: "queue worker",
  });
  assert.deepEqual(parseShellCommand("capture this"), { name: null, raw: "capture this" });
});

test("shell command parser keeps slash-prefixed inputs as commands", () => {
  assert.deepEqual(parseShellCommand("/search"), {
    name: "invalid",
    raw: "/search",
    error: "missing query for /search",
  });
  assert.deepEqual(parseShellCommand("/wat"), {
    name: "invalid",
    raw: "/wat",
    error: "unknown slash command: /wat",
  });
});

test("shell help lines list supported slash commands", () => {
  assert.deepEqual(getShellHelpLines(), [
    "commands:",
    "/help show available shell commands",
    "/queue show queued jobs, active work, recent finished jobs, and state counts",
    "/search <query> run a QMD search without writing notes",
    "/related <query> show compact related-note matches in the log",
    "/quit quit when idle, or warn if work is still pending",
  ]);
});

test("shell quit policy exits immediately when idle", () => {
  assert.deepEqual(
    resolveShellQuitRequest({
      hasPendingWork: false,
      hasWarnedAboutPendingWork: false,
      source: "interrupt",
    }),
    {
      shouldExit: true,
      shouldWarn: false,
      forceExit: false,
      nextWarnedAboutPendingWork: false,
      warningMessage: null,
    },
  );
});

test("first interrupt warns and second interrupt forces exit when work is pending", () => {
  assert.deepEqual(
    resolveShellQuitRequest({
      hasPendingWork: true,
      hasWarnedAboutPendingWork: false,
      source: "interrupt",
    }),
    {
      shouldExit: false,
      shouldWarn: true,
      forceExit: false,
      nextWarnedAboutPendingWork: true,
      warningMessage: "pending work still running; press Ctrl+C again to force quit",
    },
  );

  assert.deepEqual(
    resolveShellQuitRequest({
      hasPendingWork: true,
      hasWarnedAboutPendingWork: true,
      source: "interrupt",
    }),
    {
      shouldExit: true,
      shouldWarn: false,
      forceExit: true,
      nextWarnedAboutPendingWork: true,
      warningMessage: null,
    },
  );
});

test("slash quit matches first-warning semantics while work is pending", () => {
  assert.deepEqual(
    resolveShellQuitRequest({
      hasPendingWork: true,
      hasWarnedAboutPendingWork: true,
      source: "command",
    }),
    {
      shouldExit: false,
      shouldWarn: true,
      forceExit: false,
      nextWarnedAboutPendingWork: true,
      warningMessage:
        "pending work still running; wait for queue to drain or press Ctrl+C to force quit",
    },
  );
});
