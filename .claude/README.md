# Trinity — three-agent harness for Claude Code

A harness implementation of Anthropic's Planner / Generator / Evaluator pattern
for long-running coding tasks. Run with `/trinity <request>`.

## References

- Anthropic — *Harness design for long-running apps* (https://www.anthropic.com/engineering/harness-design-long-running-apps)
- Qiita summary by @nogataka (https://qiita.com/nogataka/items/efe8eb9df612d2211221)

## Why three agents

A single agent doing plan + implement + judge in one context drifts: the plan
gets revised mid-implementation, the evaluator goes easy on its own work, and
exploration tokens crowd out execution tokens. Splitting the roles into three
subagents — each with its own system prompt and a fresh context — keeps each
stage focused and lets the evaluator stay independently skeptical.

## Layout

```
.claude/
├── agents/
│   ├── planner.md      # opus  · request → plan file
│   ├── generator.md    # sonnet · plan → code + commit
│   └── evaluator.md    # sonnet · diff + plan → verdict
├── commands/
│   └── trinity.md      # /trinity orchestrator
├── trinity/            # plan files + per-iteration eval reports (created at runtime)
└── settings.json       # hooks + permission allowlist
```

## Communication is file-based

Agents do not see each other's chat context. They communicate through files:

| Producer  | File                                             | Consumer  |
|-----------|--------------------------------------------------|-----------|
| Planner   | `.claude/trinity/<YYYYMMDD-HHMM>-<slug>.md`        | Generator, Evaluator |
| Generator | a single git commit (SHA passed by orchestrator) | Evaluator |
| Evaluator | `.claude/trinity/<plan-stem>.eval-<n>.md`          | Planner (next iter) |

This is what keeps the evaluator independent: it reads the plan and the diff,
not the generator's reasoning.

## Model assignment (article-recommended)

| Agent     | Model  | Why |
|-----------|--------|-----|
| Planner   | opus   | Hardest reasoning step — turning vague intent into binary criteria |
| Generator | sonnet | Cost-sensitive bulk work, well-suited to clear specs |
| Evaluator | sonnet | Independent skepticism doesn't require Opus; Sonnet keeps cost down |

Override per-agent via the `model:` field in each agent's frontmatter.

## Usage

```
/trinity Add a user-settings page with theme toggle.
/trinity --max-iter=5 Migrate the auth module from JWT to session cookies.
```

Default `MAX_ITER` is 15. Lower it (`--max-iter=3`) for quick iteration on
small tasks — at 15 iterations Opus × N can get expensive, so the default
suits long-running, high-quality tasks where you want the harness to keep
correcting itself rather than bouncing back to you early.

### Pre-flight contract

- The working tree must be clean. The Evaluator reads each sprint as a single
  commit; uncommitted noise breaks that contract.
- You stay on whatever branch you started on. The harness does not switch or
  create branches.

### Loop

```
            ┌─────────────────────────────────────────┐
            ▼                                         │
  Planner ──▶ plan.md ──▶ Generator ──▶ commit ──▶ Evaluator
                                                      │
                                              PASS ───┘ exit
                                              NEEDS_REVISION / FAIL
                                                      │
                                                      └──▶ next iter
```

Stops when the verdict is PASS, or when iteration count hits `MAX_ITER`. On
hitting the cap without PASS, the latest evaluation report path is printed —
do not silently keep iterating.

## Acceptance axes (Evaluator)

Following the article's four-axis rubric, every evaluation reports binary
PASS/FAIL on:

1. **Functionality** — does the code do what the plan says?
2. **Code quality** — readable, matches existing patterns, no unjustified `any`.
3. **Visual design** — UI fidelity & accessibility (N/A if no UI changed).
4. **Product depth** — edge cases, empty/error/loading, races called out in plan.

Findings must cite `path:line`. Findings raised in iteration N may not be
silently dropped in N+1 — the evaluator either confirms the fix with new
evidence or carries the finding forward.

## Hooks (`settings.json`)

- **SessionStart** — ensures `.claude/trinity/` exists and a `.trinity.log` is
  ready.
- **SubagentStop (`generator`/`evaluator`)** — appends a timestamped line to
  `.claude/trinity/.trinity.log`. Useful for cost auditing and post-mortems.
- **PostToolUse (`Edit|Write`)** — if you edit an agent or command file,
  warns when the YAML frontmatter delimiter is missing. Keeps these files
  from silently breaking.

## Tools the Generator may invoke

The pre-approved permission allowlist covers:

- Read-only git (`status`, `log`, `diff`, `show`, `rev-parse`)
- Type checks: `tsc --noEmit`, `mypy`
- Lint: `eslint`, `ruff`
- Tests: `vitest run`, `jest`, `pytest`
- Playwright MCP for UI smoke (configured separately if you use it)

Anything else prompts. That is intentional — destructive or unusual commands
should remain explicit.

## When to grow or shrink the harness

The article's punchline: every component of the harness encodes an assumption
about what the model can't do alone. As models improve, **delete** harness
parts that no longer earn their cost. Concrete signals:

- If the Planner's plans are routinely accepted with no changes and the
  Generator never asks for clarification → consider letting the Generator
  start from raw user requests on small tasks.
- If the Evaluator returns PASS on iteration 1 for >90% of runs over a week
  → either the rubric is too lax (tighten it) or the Evaluator stage is no
  longer earning its cost on routine work.
- If iteration 2+ rarely changes the verdict → lower `MAX_ITER` default.

Conversely, add a fourth agent (Researcher before Planner, Refiner after
Evaluator) only when you have evidence the missing capability is the
bottleneck — not preemptively.
