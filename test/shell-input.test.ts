import assert from "node:assert/strict";
import test from "node:test";

import {
  canNavigateShellHistory,
  getShellSubmitModeLabel,
  isShellNewlineKey,
  isShellSubmitKey,
  isShellSubmitModeToggleKey,
  navigateShellHistory,
  pushShellHistory,
} from "../src/shell/input.js";

test("submit mode helpers map enter and shift+enter correctly", () => {
  assert.equal(isShellSubmitKey("enter-submit", { return: true }), true);
  assert.equal(isShellNewlineKey("enter-submit", { return: true, shift: true }), true);
  assert.equal(isShellSubmitKey("shift-enter-submit", { return: true, shift: true }), true);
  assert.equal(isShellNewlineKey("shift-enter-submit", { return: true }), true);
  assert.equal(getShellSubmitModeLabel("enter-submit"), "Enter submits, Shift+Enter newline");
  assert.equal(getShellSubmitModeLabel("shift-enter-submit"), "Shift+Enter submits, Enter newline");
});

test("ctrl+j toggles submit mode and history ignores multiline drafts", () => {
  assert.equal(isShellSubmitModeToggleKey("j", { ctrl: true }), true);
  assert.equal(isShellSubmitModeToggleKey("", { ctrl: true, return: true }), true);
  assert.equal(canNavigateShellHistory("single line"), true);
  assert.equal(canNavigateShellHistory("first\nsecond"), false);
});

test("history navigation restores the current draft and skips multiline entries", () => {
  const history = pushShellHistory(
    pushShellHistory(pushShellHistory([], "first capture"), "multi\nline capture"),
    "/queue",
  );

  const previous = navigateShellHistory({
    history,
    input: "draft",
    index: null,
    draft: "",
    direction: "up",
  });
  assert.deepEqual(previous, {
    input: "/queue",
    index: 1,
    draft: "draft",
  });

  const oldest = navigateShellHistory({
    history,
    input: previous.input,
    index: previous.index,
    draft: previous.draft,
    direction: "up",
  });
  assert.deepEqual(oldest, {
    input: "first capture",
    index: 0,
    draft: "draft",
  });

  const restored = navigateShellHistory({
    history,
    input: oldest.input,
    index: oldest.index,
    draft: oldest.draft,
    direction: "down",
  });
  assert.deepEqual(restored, {
    input: "/queue",
    index: 1,
    draft: "draft",
  });

  const draft = navigateShellHistory({
    history,
    input: restored.input,
    index: restored.index,
    draft: restored.draft,
    direction: "down",
  });
  assert.deepEqual(draft, {
    input: "draft",
    index: null,
    draft: "",
  });
});
