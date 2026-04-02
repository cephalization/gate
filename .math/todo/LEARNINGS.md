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
