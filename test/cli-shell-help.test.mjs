import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(rootDir, "dist", "cli.mjs");

test("root help lists the shell command", () => {
  const output = execFileSync(process.execPath, [cliPath, "--help"], {
    cwd: rootDir,
    encoding: "utf8",
  });

  assert.match(output, /shell \[options\]\s+Start the interactive capture shell/);
});

test("shell help exposes config path support", () => {
  const output = execFileSync(process.execPath, [cliPath, "shell", "--help"], {
    cwd: rootDir,
    encoding: "utf8",
  });

  assert.match(output, /Start the interactive capture shell/);
  assert.match(output, /--config <path>/);
});
