# Project Learnings Log

This file is appended by each agent after completing a task.
Key insights, gotchas, and patterns discovered during implementation.

Use this knowledge to avoid repeating mistakes and build on what works.

---

<!-- Agents: Append your learnings below this line -->
<!-- Format:
## <task-id>

- Key insight or decision made
- Gotcha or pitfall discovered
- Pattern that worked well
- Anything the next agent should know
-->

## iupe6v5b

- Extracting the staged capture flow into a pure `runCapturePipeline()` helper makes the upcoming shell worker integration straightforward without changing one-shot `gate add` behavior.
- Keep the pipeline conservative by only filtering merge candidates for merge/classify decisions; note creation should still receive the full search match list for related-note suggestions.
- Hooking `onStageChange` before each stage and `onTiming` after each stage cleanly exposes worker state transitions and per-stage durations from the same pipeline.
- A standalone `node:test` file under `test/` works well here because it can import the pure `.ts` pipeline with Node type stripping without changing the repo TypeScript config.

## kojufw8t

- Keep the first shell pass narrowly scoped to pure state modules: `types`, `queue`, `events`, and `session` were enough to model jobs, submit mode, logs, and derived stats without pulling in UI or worker code early.
- Deriving session stats from the queue keeps reducers deterministic and avoids hidden counters drifting out of sync once retries or failures are introduced later.
- For focused TypeScript unit tests in this repo, compiling a `.test.ts` file with `pnpm exec tsc --module NodeNext --moduleResolution NodeNext --types node` is more reliable than importing source `.ts` files directly with Node.
- Queue depth is easier to reason about as "queued but not currently active" so the status bar can show pending backlog separately from worker busy/idle state.

## rwq941ap

- Keep the shell bootstrap thin: a dedicated `handleShell()` plus `startShell()` boundary lets the CLI own config/store startup now without forcing worker or input logic into the first pass.
- Commander `configureHelp({ formatHelp })` should not call `helper.formatHelp(...)` from inside the override, because that recurses back into the same override. For this repo, printing the custom bare-`gate` help text from `src/cli.ts` is the safer pattern.
- A built-CLI smoke test in `test/cli-shell-help.test.mjs` is a better fit than a source-level `.ts` test here, because the repo uses ESM `.js` specifiers in source and the acceptance criteria are about the shipped command surface.
- `resolveConfigPath()` is a useful small helper for keeping `loadConfig()`, `saveConfig()`, and shell startup aligned on the exact config file path being used.

## 99j95ubo

- A small mutable `createShellWorker()` store is enough to keep the Ink shell non-blocking while still reusing the shared `captureNoteWithHooks()` pipeline for every stage transition and timing update.
- Publishing stage changes from the pipeline hooks directly into both `ShellJob.state` and the activity log keeps worker progress durable without duplicating the capture logic in shell-specific code.
- For focused shell tests in this repo, compile a `.test.ts` file into a temporary directory inside the repo before running `node --test`; compiling outside the workspace breaks package resolution for runtime deps like `ai`.
- `vp check --fix` is the fastest way to align new Ink/worker files with the project formatter before the required verification pass.

## jr8cw273

- Keeping the new input behavior in a small pure `src/shell/input.ts` module made multiline submit rules and Up/Down history easy to test without adding Ink rendering tests.
- `Ctrl+J` handling needs to be checked before normal Enter handling because some terminals report it as a control-return style key event rather than plain text input.
- Restricting history navigation to single-line entries keeps multiline compose stable and matches the "capture first" shell workflow instead of letting Up/Down unexpectedly replace a draft with a multiline payload.
- For this repo's ESM `.js` source imports, the reliable focused test path is still: temporary `tsc` output inside the workspace, then `node --test` on the emitted files.

## wunm86ah

- Keeping slash-command parsing and quit-policy resolution in a small pure `src/shell/commands.ts` module made the new `/help`, `/quit`, and Ctrl+C behavior easy to test without mounting Ink.
- UI-originated shell log entries need to go through the worker store; app-local log state gets overwritten by the next worker publish.
- For consistent first-warning/second-force Ctrl+C handling, read pending-work state from `worker.getState()` and track the warning latch in a ref so overlapping interrupt events do not race React state updates.
- `expect` works better than piped pseudo-tty tricks for manual Ink shell validation in this repo because Ink requires a real raw-mode TTY.
