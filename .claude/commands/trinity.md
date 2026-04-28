---
description: Run the Planner → Generator → Evaluator harness pipeline. Usage `/trinity <request>` or `/trinity --max-iter=5 <request>`.
argument-hint: [--max-iter=N] <feature request in 1-4 sentences>
---

# /trinity — three-agent harness pipeline

Orchestrate the harness: Planner expands the request, Generator implements & commits, Evaluator independently judges. Loop until PASS or `max_iter` is hit.

## Arguments

Raw arguments: `$ARGUMENTS`

Parse them as follows:
1. If `$ARGUMENTS` starts with `--max-iter=N` (where N is a positive integer), set `MAX_ITER = N` and strip that token. Otherwise `MAX_ITER = 3` (default).
2. The remainder is the **request**. If empty, ask the user for a 1-4 sentence request and stop — do not proceed.

## Pre-flight

Before launching agents:
- Confirm `git status` is clean (no uncommitted changes). If dirty, **stop** and tell the user to commit/stash first — the Evaluator relies on a clean baseline to read each sprint's diff.
- Confirm the current branch is the intended working branch (show it to the user, do not switch).
- Ensure `.claude/plans/` exists (`mkdir -p .claude/plans`).

## Pipeline (loop, n = 1 .. MAX_ITER)

### 1. Planner
Launch the `planner` subagent with:
- The request (verbatim).
- `Iteration: <n>`.
- If `n > 1`: the prior plan path and the prior evaluator report path.

Capture the **plan path** it returns. If Planner asked a clarifying question, surface it to the user and stop.

### 2. Generator
Launch the `generator` subagent with:
- The plan path.
- `Iteration: <n>`.

Capture the verification report and the **commit SHA**. If Generator could not commit (verification failed and it could not fix it), stop and surface the failure — do not call Evaluator on a non-existent commit.

### 3. Evaluator
Launch the `evaluator` subagent with:
- The plan path.
- The commit SHA.
- The Generator's verification report.

Capture the **evaluation report path** and the **verdict** (PASS / NEEDS_REVISION / FAIL).

### 4. Branching
- **PASS** → print a one-line summary to the user (commit SHA, plan path, eval path) and exit the loop.
- **NEEDS_REVISION** and `n < MAX_ITER` → continue loop (Planner gets the eval report on next pass; it should update the existing plan in place, not create a new one).
- **FAIL** → continue loop the same way; Planner is expected to re-plan more aggressively.
- `n == MAX_ITER` and not PASS → stop. Print the latest eval report path and the unresolved findings. Do **not** silently keep iterating.

## Output to user

After the loop ends, print exactly:

```
Trinity result: <PASS | NEEDS_REVISION at iter <n> | FAIL at iter <n>>
Plan:    <plan path>
Commit:  <last commit SHA>
Eval:    <last eval report path>
Iters:   <n>/<MAX_ITER>
```

Followed by a 2-3 sentence summary in plain English. No more.

## Constraints on the orchestrator (you)

- Run subagents **sequentially**, not in parallel — each step depends on the previous.
- Do **not** read or edit code yourself between steps. Pass paths/SHAs only. The whole point of the harness is that each agent works from artifacts, not your context.
- Do **not** summarize agent outputs into the next agent's prompt — pass the file paths and let the next agent read them. This preserves the independence the Evaluator needs.
