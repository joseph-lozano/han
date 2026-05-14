# /code-review

Operator documentation for the `/code-review` skill in the han plugin. This document helps you decide *when* and *how* to use the skill. For what the skill does internally, read the skill definition at [`plugin/skills/code-review/SKILL.md`](../../plugin/skills/code-review/SKILL.md).

> See also: [Plugin landing page](../../README.md) · [All skills](./README.md) · [All agents](../agents/README.md) · [YAGNI](../yagni.md)

## TL;DR

- **What it does.** Comprehensive code review of the current branch's changes, or of specified files when git is not available.
- **When to use it.** You want a principled review of what changed before merge: correctness, testing, security, documentation compliance, and project-pattern deference.
- **What you get back.** A structured review with findings classified as CRIT / WARN / SUGG, each with `file_path:line_number` references and suggested fixes.
- **Size-aware.** The skill classifies the change as small / medium / large, defaults to small, and dispatches a roster proportional to scope. Pass the size as the first positional argument to override (`/code-review medium`). See [Sizing](../sizing.md) for the full model.

## Key concepts

- **Three severity levels.** CRIT (must fix before merge: security, data corruption, breaking API), WARN (should fix: bugs, missing error handling, missing tests), SUGG (consider: style, refactoring, docs). When uncertain, choose the higher severity for manual-review findings; agent-dispatched findings calibrate severity to size (see Sizing below).
- **Three review modes.** Mode A uses the full git branch diff. Mode B reviews uncommitted work when no branch diff exists. Mode C reviews specified files when git is absent.
- **Size-aware agent dispatch.** Two agents always run on every review (`junior-developer` for clarity and standards, `adversarial-security-analyst` for exploit-path security). The rest of the roster (`test-engineer`, `edge-case-explorer`, `structural-analyst`, `behavioral-analyst`, `concurrency-analyst`, `data-engineer`, `devops-engineer`) is dispatched conditionally based on what the changed files touch. Larger sizes raise the upper bound on the roster; smaller sizes prefer fewer agents producing higher-signal findings. See the [Sizing](#sizing) section below.
- **Calibration directive.** Every dispatched agent receives a calibration directive that requires findings to be either introduced or worsened by the change, or critical irrespective of who introduced it. Theoretical concerns, pre-existing best-practice gaps, and benign-outcome scaling worries are excluded. Severity scales with size: small change → only Critical findings escalate; medium → Critical and Warning; large → all severities.
- **Project-pattern deference.** A pattern that differs from general best practices but is consistent within the project is *not* a finding. Only deviations from the project's own conventions count.
- **Automated tool boundary.** If the project has a linter or formatter, trust it. Only flag style issues that tooling cannot catch.
- **Documentation compliance and freshness.** ADRs, coding standards, and general docs are read and checked against the diff. Stale docs that misdescribe current behavior become CRIT findings.

## When to use it

**Invoke when:**

- You are about to merge a branch and want a principled pre-merge review covering correctness, tests, security, and doc compliance.
- A change has landed that you want audited against the project's ADRs, coding standards, or general docs.
- You want the exploit-path, coverage-gap, edge-case, structural, behavioral, clarity, and (when relevant) concurrency dimensions covered *in parallel* rather than one at a time.
- You are working without a GitHub PR (local code, experimental branch, personal fork) and want the full review without posting to a PR.
- You want review findings on files you specify by name even when git is not available. The skill gracefully degrades to file-based review.

**Do not invoke for:**

- **Posting the review to a GitHub PR.** Use [`/gh-pr-review`](./gh-pr-review.md). It delegates to this skill and then posts the review as PR comments.
- **Architectural analysis.** Use [`/architectural-analysis`](./architectural-analysis.md) for coupling, data flow, concurrency, and SOLID assessment across a module.
- **Bug investigation.** Use [`/investigate`](./investigate.md) to find a root cause with evidence and adversarial validation.
- **Test planning in isolation.** Use [`/test-planning`](./test-planning.md) when you want a prioritized test plan without a full correctness review.
- **Plan review.** Use [`/iterative-plan-review`](./iterative-plan-review.md) for reviewing a work plan, not code.

## How to invoke it

Run `/code-review` in Claude Code or Pi. Pass an optional size override and/or context.

Give it:

1. **A size override, optional.** Pass `small`, `medium`, or `large` as the first positional argument to override auto-classification. Without an override, the skill defaults to small and escalates only when signals clearly require it. See the [Sizing](#sizing) section.
2. **A focus-area or context hint, optional.** *"Focus on the security implications of the new auth endpoints,"* or *"review with extra attention to the database migration."* Focus hints bias the manual review toward the named area; the parallel agents still run on their domain-scoped slice of files.
3. **A branch (implied).** If you are on a feature branch, the skill reviews changed files against the default branch (Mode A). If you are on the default branch with uncommitted work, Mode B kicks in. If there is no git, Mode C reviews what you point it at.
4. **Specific files or globs, optional.** In Mode C (or when you want to scope a git-mode review), pass file paths or glob patterns.

Example prompts:

- `/code-review`. Full review of the current branch's changes; auto-classifies size, defaulting to small.
- `/code-review medium`. Override the size to medium.
- `/code-review large "focus on the new auth endpoints"`. Override to large with a focus hint.
- `/code-review`. *"Focus on the security implications of the new auth endpoints."*
- `/code-review src/billing/`. Scope the review to the billing directory.

## What you get back

A structured review in-channel containing:

- **A Review Summary table** counting CRIT / WARN / SUGG findings across categories (automated checks, correctness, testing, security, ADR/standard/docs compliance, documentation freshness).
- **Critical findings** (🔴). Each with task ID (`CRIT-001`, `CRIT-002`, …), category, `file_path:line_number`, the issue, the recommended fix, and (for security findings) an `EXPLOIT:` description.
- **Warnings** (🟡). Same structure with task ID `WARN-NNN`.
- **Suggestions** (🟢). Same structure with task ID `SUGG-NNN`.
- **Agent findings.** Coverage gaps (`T-NNN`), edge cases (`EC-NNN`), security findings (`SEC-NNN`), structural findings (`S-NNN`), behavioral findings (`B-NNN`), clarity findings (`JD-NNN`), and concurrency findings (`C-NNN` when the concurrency analyst was dispatched). Each is classified into the main severity tiers using the classification rubric and cross-referenced in the appropriate severity section.
- **Deferred tests note.** Test cases the `test-engineer` considered but excluded as brittle, listed for transparency (not counted toward the finding cap).
- **ADR / coding-standard / documentation compliance findings.** Violations of project-specific docs, tagged with the source (for example, `[ADR: 0042]`, `[Standard: error-handling]`, `[Docs Update: payments.md]`).

Finding caps are 30 items each for the manual review pass and the agent pass; security findings are not capped. If a cap is exceeded, the skill says so and recommends another review after fixes land.

## How to get the most out of it

- **Run `/project-discovery` first.** The skill reads CLAUDE.md and `project-discovery.md` to find the ADR, coding-standards, and documentation directories. Without them, the compliance and freshness steps degrade to best-effort discovery.
- **Keep docs, ADRs, and standards up to date.** Every reference the skill finds sharpens the compliance check. Stale docs that contradict current behavior become CRIT findings, which is the signal to update the doc, not to bypass the skill.
- **Use focus hints for deep-dive branches.** When a branch touches a load-bearing surface (auth, billing, data migrations), name it in the prompt. The skill biases manual attention toward the area while the parallel agents still cover the full scope.
- **Pair with `/investigate` when findings reveal a bug.** If the review surfaces a CRIT finding whose root cause needs deeper analysis, dispatch `/investigate` next. It produces a fix plan with adversarial validation.
- **Pair with `/architectural-analysis` when findings reveal coupling or structural issues.** The review runs per-file; the architectural analysis runs per-module. Use both when the branch touches boundaries.
- **Re-run after fixes.** The skill is cheap to re-dispatch. Fix the findings, run again, confirm the count drops.
- **Use `/gh-pr-review` if you want it posted to the PR.** `/gh-pr-review` invokes this skill end-to-end, then posts the review to GitHub. If you already ran this one locally, you can run `/gh-pr-review` next to publish.

## Sizing

Size is the primary lever the skill uses to decide how aggressively to review the change. The skill defaults to small and only escalates when concrete signals require it.

| Size | Files | Other signals | Roster (max) | Severity bands in scope |
|---|---|---|---|---|
| **Small** *(default)* | 1–3 files | Single subsystem; no cross-cutting concerns; no new module boundaries; no schema, migration, or infra changes; no auth/PII surface added. | The two required agents (`junior-developer`, `adversarial-security-analyst`) plus any conditional agent whose signal clearly fires (for example, a new test boundary triggers `test-engineer`). | Only Critical findings escalate from agents; manual review still flags Warnings introduced by the change. Suggestions are dropped. |
| **Medium** | 3–10 files | One or two adjacent subsystems; may touch a single cross-cutting concern (one API contract, one schema migration, one new permission check, one new index). | Required two plus the conditional agents whose signals fire. Typically `test-engineer`, `edge-case-explorer`, and one of `structural-analyst` / `behavioral-analyst` / `data-engineer` / `devops-engineer`. | Critical and Warning findings escalate from agents; Suggestions only when directly introduced by this change. |
| **Large** | More than 10 files | Multiple subsystems, architectural changes, security or data implications, multi-service coordination, or you explicitly request full agent review. | Required two plus all conditional agents whose signals fire. | All severities are in scope. |

How the size is chosen:

- **Default to small.** Unless the file list and signals push the change into medium or large, the skill stays at small.
- **Conditional roster.** Agents are dispatched only when their signal appears in the file list. `concurrency-analyst` only when the files touch threads / async / shared state. `data-engineer` only when the files touch schemas, migrations, queries, or ORM models. `devops-engineer` only when the files touch infra, CI/CD, or deployment. Larger sizes do not force agents whose signals are absent.
- **Calibration directive.** Every dispatched agent receives a directive scoped to the size. The smaller the size, the narrower the severity bands the agent escalates, and the more aggressively benign-outcome concerns are dropped.

How to override the size:

- Pass `small`, `medium`, or `large` as the first positional argument: `/code-review medium`, `/code-review large "focus on the new auth endpoints"`.
- When the size is overridden via `$size`, the skill announces the override (`Medium: passed via $size`) and uses the chosen band for the roster cap and the calibration directive.
- Conversational overrides (*"treat this as a large review"*) work as well and are equivalent.

For the cross-skill sizing model and design principles, see [Sizing](../sizing.md).

## Cost and latency

Cost scales with the chosen size. The two required agents (`junior-developer`, `adversarial-security-analyst`) always run; the rest of the roster is dispatched conditionally and capped by size. Automated checks (lint/build/tests from the project config), a file-by-file manual review, a documentation compliance pass, and a freshness pass run alongside.

- **Small change.** Typically 2–4 agents in parallel plus the manual pass. Minutes for the agents; manual pass scales with file count.
- **Medium change.** Typically 4–6 agents plus the manual pass.
- **Large change.** Typically 6–9 agents plus the manual pass.

Agents run on their default models. Finding caps of 30 per pass keep output bounded. Security findings are uncapped. The skill is built for per-branch cadence, not tight-loop iteration over the same code. Fix the findings and re-run.

## In more detail

The skill walks a nine-step process:

1. **Identify changes.** Detect git mode (A/B/C), resolve project config, enumerate changed files.
2. **Automated quality checks.** Run the project's lint, build, and test commands. Report each failure as a CRIT finding with category `[Automated Check]`. Do not fix; report.
3. **Classify size and dispatch review agents in parallel.** Step 3.1 classifies the change as small / medium / large, defaulting to small. Step 3.2 selects agents: the required two (`junior-developer`, `adversarial-security-analyst`) plus any conditional agents whose signals appear in the file list (`test-engineer`, `edge-case-explorer`, `structural-analyst`, `behavioral-analyst`, `concurrency-analyst`, `data-engineer`, `devops-engineer`). Step 3.3 attaches a size-scoped calibration directive to every brief. Step 3.4 passes each agent only the slice of the file list relevant to its domain. Step 3.5 launches all selected agents in parallel.
4. **Manual file-by-file review.** Every changed file (alphabetical) against the review checklist: correctness, data isolation, performance, error handling, testing, API design, maintainability, organization, docs, style, database, ADR compliance.
5. **Documentation compliance analysis.** Read ADRs, coding standards, and docs relevant to the change. Flag contradictions.
6. **Documentation freshness review.** Check whether docs describing the changed code are now stale.
7. **Collect and classify agent results.** Read every dispatched agent's output file. Classify their findings into CRIT/WARN/SUGG using the finding-classification rubrics. Junior-developer findings that overlap with a specialist's finding reference the specialist instead of duplicating.
8. **Generate review output.** Assemble the final review using the review template.
9. **Verify.** Task IDs sequential, `file_path:line_number` valid, exploit fields populated for security findings, summary table matches detail.

## YAGNI

YAGNI in `/code-review` is **advisory-only**. The reviewer surfaces speculative additions (defensive code at trusted internal boundaries, single-implementation interfaces, configuration knobs no caller sets, instrumentation for telemetry that isn't reaching the destination yet) but a YAGNI finding alone does not block a clean review. The posture is *make the cost of inclusion visible*, not *reject the change*. You decide whether to keep the speculative addition; when you keep it, the rationale is recorded so the choice stays visible. Critical-path correctness, security, and data-integrity findings are unaffected by this advisory posture and follow the standard severity rules.

See [YAGNI](../yagni.md) for the two gates, the acceptable-evidence list, the named anti-patterns, and why review skills make the cost of inclusion visible rather than enforce inclusion bans.

## Sources

The skill's protocols are grounded in established practice for pre-merge code review, parallel adversarial specialist review, and documentation-compliance checking.

### Karl E. Wiegers: Peer Reviews in Software

Wiegers's *Peer Reviews in Software* (2001) formalized inspection-style peer review as a distinct engineering discipline: a structured, checklist-driven pass that finds defects earlier and cheaper than testing alone. The skill's manual review step uses a structured checklist for exactly this reason.

URL: https://www.processimpact.com/books/PeerReviews.html

### Smartbear: State of Code Review

Smartbear's annual surveys of code-review practice document the measurable effect of structured reviews on defect density and time-to-fix. The skill's severity scheme (CRIT/WARN/SUGG) and its finding cap reflect the consistently measured finding that reviews of more than ~400 LoC per hour lose effectiveness. Caps prevent flood and prioritization drift.

URL: https://smartbear.com/resources/ebooks/the-state-of-code-review/

### Gene Kim, Jez Humble, et al.: Accelerate

*Accelerate* documents DORA research showing that high-performing teams rely on fast, automated, continuous review practices as part of their delivery flow. The skill's parallel agent dispatch during the manual review reflects this. Specialists and the reviewer work concurrently rather than in sequence.

URL: https://itrevolution.com/product/accelerate/

## Related documentation

- [Plugin landing page](../../README.md). The front door. Start here if you arrived from outside the docs tree.
- [YAGNI](../yagni.md). The evidence-based "You Aren't Gonna Need It" rule this skill applies before committing items. The two gates, the acceptable-evidence list, the named anti-patterns, and the deferral format.
- [Skills Index](./README.md). All 15 skills, grouped by purpose.
- [`/gh-pr-review`](./gh-pr-review.md). Wraps this skill and posts the review to a GitHub PR.
- [`/investigate`](./investigate.md). Next step when a CRIT finding hides a bug whose root cause needs deeper analysis.
- [`/architectural-analysis`](./architectural-analysis.md). Run alongside when the change touches module boundaries.
- [Sizing](../sizing.md). The cross-skill sizing model. Explains the small / medium / large bands, the default-to-small rule, and the `$size` override.
- [`junior-developer`](../agents/junior-developer.md), [`adversarial-security-analyst`](../agents/adversarial-security-analyst.md). The two agents this skill always dispatches.
- [`test-engineer`](../agents/test-engineer.md), [`edge-case-explorer`](../agents/edge-case-explorer.md), [`structural-analyst`](../agents/structural-analyst.md), [`behavioral-analyst`](../agents/behavioral-analyst.md), [`concurrency-analyst`](../agents/concurrency-analyst.md). Conditional dispatches that join the roster when their signal appears in the file list.
- [`data-engineer`](../agents/data-engineer.md), [`devops-engineer`](../agents/devops-engineer.md). Conditional dispatches for changes touching schemas/migrations/queries (data) or infra/CI/observability (devops).
- [`SKILL.md` for /code-review](../../plugin/skills/code-review/SKILL.md). The internal process definition.
