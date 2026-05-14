---
name: code-review
description: "Run a comprehensive code review on local source files. Use this skill when the user asks to review, audit, inspect, evaluate, or check code — or when they ask to make sure, verify, or validate that code follows good coding standards, is free of errors or bugs, has sufficient test coverage, or meets best practices, even if they never use the word \"review.\" Triggers for any request to assess code quality, correctness, or security of specific files, directories, or the current branch. Also use when the user invokes /code-review directly. Works on git branches (reviewing changed files against the default branch) or on specified files and directories when git is not available. Does not post comments to GitHub pull requests — use gh-pr-review for that. Does not analyze architectural structure or module boundaries — use architectural-analysis for that."
arguments: size
argument-hint: "[size: small | medium | large] [optional context about changes or areas to focus on]"
allowed-tools: Bash(git *), Bash(make *), Bash(npm *), Read, Grep, Glob, Agent
---

## Pi Compatibility

When this skill runs under Pi, apply [Pi compatibility](../../references/pi-compatibility.md): use Pi's `subagent(...)` tool for every instruction that says to launch an `Agent` tool call, and use parallel `tasks` for swarm launches.


When running a code review, follow the process outlined here.

## Project Context

- git installed: !`which git`
- CLAUDE.md: !`find . -maxdepth 1 -name "CLAUDE.md" -type f`
- project-discovery.md: !`find . -maxdepth 3 -name "project-discovery.md" -type f`

## Review Constraints

Severity levels:
- **Critical** — Must fix before merge. Security vulnerabilities, data corruption risk, breaking API changes, data isolation failures.
- **Warning** — Should fix. Bugs that don't corrupt data, significant performance issues, missing required tests, missing error handling.
- **Suggestion** — Consider improving. Style improvements, optional performance gains, documentation gaps, refactoring opportunities.

When uncertain, choose the **higher** severity. Include `file_path:line_number` references and code examples for suggested fixes.

**Finding caps:** Manual review findings (Steps 4-6) and agent findings (Step 7) are each capped at 30 items. Prioritize by severity: all CRIT first, then WARN, then SUGG. If either cap is exceeded, note that additional items were omitted and another code review is recommended after addressing current items. Security findings are not capped (see classification rubric).

**Project pattern deference:** A pattern that differs from general best practices but is consistent within the project is not a review finding. Only flag deviations from the project's own conventions.

**YAGNI findings are a separate, non-correcting class.** Apply the evidence-based YAGNI rule from [../../references/yagni-rule.md](../../references/yagni-rule.md) to every change in the diff. A YAGNI finding identifies code introduced by this change that has no evidence of being needed *now* — a new abstraction with one implementation, a configuration knob no caller sets, a defensive guard at a trusted internal boundary, a runbook for an alert that has never fired, an observability hook for telemetry that isn't flowing, an SLO for absent traffic, an index for a query that doesn't run, an audit column nobody reads, a feature flag wrapping a single code path with no rollout strategy, code added "for future flexibility" or symmetry. **YAGNI findings are listed in their own `### 🟡 YAGNI` section, separate from Critical / Warning / Suggestion**, and **do not appear under CRIT / WARN / SUGG**. The YAGNI section opens with this exact statement: *"These findings will not be corrected unless explicitly requested. They are documented so the team can decide consciously whether to keep, simplify, or defer the items."* Each YAGNI finding records what was found, which gate or named anti-pattern from the rule applies, and the trigger that would justify keeping it. Severity calibration (the calibration directive in Step 3.3) does NOT apply to YAGNI — these findings are surfaced regardless of change size, but they are advisory, not corrective.

**Automated tool boundary:** If the project has a linter or formatter, trust it. Only flag style issues that automated tools can't catch.

### Task ID Assignment

Assign a unique task ID to each review item:
- **CRIT-###** for critical items (e.g., CRIT-001, CRIT-002)
- **WARN-###** for warnings (e.g., WARN-001, WARN-002)
- **SUGG-###** for suggestions (e.g., SUGG-001, SUGG-002)
- **YAGNI-###** for YAGNI candidates (e.g., YAGNI-001, YAGNI-002) — these are advisory and listed in their own section; they are not corrected unless the user explicitly requests it

IDs are sequential within each category, starting at 001. Assign IDs in the order files are reviewed (alphabetically).

**Category Assignment:** When an issue fits multiple categories, use the **first matching category** from the checklist order in [review-checklist.md](references/review-checklist.md).

## Step 1: Identify Changes

Resolve project config: read CLAUDE.md's `## Project Discovery` section for docs, ADR, and coding-standards directories plus test, lint, and build commands (look under `### Commands and Tests`, not `### Frameworks and Tooling`); fall back to project-discovery.md; fall back to Glob defaults (`docs/`, `docs/adr/`, `docs/coding-standards/`). Store found values for use in Steps 2, 5, and 6. Continue without any keys that remain unfound.

### Detect review context

Check the `git installed` value from Project Context above. If it is empty, skip directly to **Mode C** below.

1. Run `${CLAUDE_SKILL_DIR}/scripts/detect-review-context.sh` to detect the git environment. Capture the output — it contains key-value pairs describing git availability, branch name, default branch, and changed files.

Use the script output to determine the review mode. If the script reports `git-available: false`, skip to **Mode C**.

**Mode A: Full git context** — script reports `git-available: true` and `changed-files-start` block has content.
- Use the changed files list from the script output as the review scope
- Run `git diff {default-branch}...HEAD` to retrieve the full diff (fetch as a separate Bash command so large diffs are handled incrementally)
- Store the branch name from the script output for use in Step 3

**Mode B: Git but no branch changes** — script reports `git-available: true` but `changed-files: none`.
- Run `git diff` (unstaged) and `git diff --cached` (staged) to check for uncommitted work
- Run `git status --short` to identify modified, added, and untracked files
- If files are found, use those as the review scope (review files directly by reading them — no base-branch diff is available)
- Store the branch name from the script output for use in Step 3
- If no files found, fall through to **Mode C**

**Mode C: No git / no changes found**
- If the user provided file paths, glob patterns, or directories as arguments, use those to build the file list (expand with Glob)
- If no arguments provided, use Glob to discover source files in the current directory, excluding: `node_modules/`, `.git/`, `vendor/`, `dist/`, `build/`, `__pycache__/`, `*.min.js`, `*.min.css`, lock files
- Present the discovered files and ask the user to confirm the review scope
- Note: In Mode C, review files by reading them in full rather than comparing against a diff (no diff is available)

If the user provided focus areas in their arguments, note them for use in Step 4.

## Step 2: Automated Quality Checks

Using the file list from Step 1, run automated checks from the project root directory. **Do not fix any errors** — report each failure in the review output.

Use the test, lint, and build commands from Step 1's project config lookup. If a command was not found, silently skip that check.

Run each command **one at a time, sequentially**, scoped to changed areas when possible. Record each failure (command + relevant error output) as a **CRIT** item with category **[Automated Check]**, then continue to the next command.

## Step 3: Classify Change Size and Dispatch Review Agents

Agents analyze source code to identify coverage gaps, edge cases, security vulnerabilities, structural problems, runtime-behavior risks, concurrency hazards, and clarity issues — they do not execute tests. (The test command gate applies only to Step 2's automated checks.) The classification below decides which agents are dispatched and how their briefs are scoped, so agents do not produce findings disproportionate to the change.

Determine the output directory for agent reports: if the project has an existing documentation folder (e.g., `docs/`), use it; otherwise use the current working directory.

### Step 3.1: Classify the change

**Default to small.** Start the classification at **small** and only escalate to medium or large when the signals below clearly require it. When a signal is borderline, stay at the smaller band. Use these signals on the file list from Step 1:

- **Small** *(default)* — 1–3 files affected, single subsystem, no cross-cutting concerns. No new module boundaries. No schema, migration, or infrastructure changes. No auth/PII surface added.
- **Medium** — 3–10 files, one or two adjacent subsystems. May touch a single cross-cutting concern (one API contract, one schema migration, one new permission check, one new index).
- **Large** — more than 10 files, multiple subsystems, architectural changes, security or data implications, multi-service coordination, or the user explicitly requests full agent review.

**Size override.** If `$size` is non-empty (the user passed `small`, `medium`, or `large` as the first argument), use that value as the size and skip the signal-based classification. If `$size` is empty, classify from the signals above. Anywhere else in this skill body that mentions a "user override" of size, this argument is the override.

State the chosen size in one line with the justification (e.g., "Medium: 6 files touched, adds one index and a query for it" or "Medium: passed via `$size`"). Also draft a one-line summary of what the change does — this is reused in agent briefs below.

### Step 3.2: Select agents

**Always dispatch — minimum roster across all sizes:**

1. `junior-developer` — generalist clarity and standards check, applicable to any change.
2. `adversarial-security-analyst` — security findings have a non-negotiable evidence standard that already prevents theoretical reports; the agent stays silent when the standard is not met.

**Conditionally dispatch the rest based on signals in the file list.** Skip any whose signal does not appear:

| Agent | Include when... |
|---|---|
| `test-engineer` | source files with logic or behavior were added or modified (skip for docs-only or pure config changes) |
| `edge-case-explorer` | code processes inputs with boundaries, parses external data, or handles multiple states (skip for trivial edits, renames, or docs-only changes) |
| `structural-analyst` | the change introduces new files, new modules, or modifies dependency direction across modules (skip for single-file in-place edits) |
| `behavioral-analyst` | the change modifies runtime data flow across module boundaries, error propagation paths, or state management (skip for self-contained changes within a single function or class) |
| `concurrency-analyst` | the file list touches threads, async/await, goroutines, actors, shared mutable state across requests, timers, locks, or message queues |
| `data-engineer` | the change touches a schema definition, migration file, query, ORM model, index definition, document shape, stream contract, or data-access module |
| `devops-engineer` | the change touches Dockerfiles, IaC (Terraform/Pulumi/CloudFormation), Kubernetes manifests, CI/CD pipeline files, deployment scripts, observability config, feature-flag config, or rollout-affecting code paths |

**Selection rules:**

- Honor any agent the user named explicitly.
- For each conditional agent included, justify in one line — name the file or signal that triggered inclusion.
- Fewer is better. If a signal is borderline, **skip** the agent rather than include it. A small change that nominally touches a query but is not modifying its behavior does not require `data-engineer`.

State the selected roster to the user in one line per agent before launching.

### Step 3.3: Scope every agent brief to the change

Every dispatched agent receives — alongside its domain-specific prompt — the following calibration directive verbatim. This directive overrides the default review-wide "prefer the higher severity" rule for agent-dispatched findings:

> **Calibrate findings to the change being reviewed.** This is a **{size}** change touching {N} files. The change does the following: {one-line summary from Step 3.1}.
>
> Raise a finding only when **at least one** of these holds:
> 1. The change actively introduces or worsens the issue.
> 2. The issue is critical irrespective of who introduced it — proven security exploit, data corruption, data isolation break, or data loss with no recovery.
>
> Do **not** raise:
> - Theoretical concerns the change does not touch.
> - Pre-existing best-practice gaps the change did not make worse.
> - Multi-instance, scale-out, replay, or migration-coordination concerns whose worst-case outcome is **benign** — meaning the second attempt no-ops, the user can retry without harm, the side effect is already in place, or the operation is naturally idempotent at the storage layer (e.g., `CREATE INDEX IF NOT EXISTS`, idempotent upserts, the same row reconciled twice).
> - Hypothetical scaling problems for workloads the project does not currently have.
>
> Severity calibration scales with size:
> - **Small change**: only Critical findings escalate. Raise Warnings only when the finding is directly introduced by this change. Omit Suggestions entirely.
> - **Medium change**: Critical and Warning findings escalate. Raise Suggestions only when directly introduced by this change.
> - **Large change**: all severities are in scope.
>
> When uncertain about severity, prefer the **lower** severity. If the worst-case impact is "an operator sees an error and retries," that is not Critical.
>
> **YAGNI findings are separate from severity.** Apply [../../references/yagni-rule.md](../../references/yagni-rule.md) to every change in the diff regardless of size. A YAGNI finding identifies code introduced by this change that has no evidence of being needed now: a new abstraction with one implementation, configuration knob no caller sets, defensive guard at a trusted internal boundary, runbook for never-fired alert, observability for non-flowing telemetry, SLO for absent traffic, index for unrun query, audit column with no consumer, feature flag wrapping a single code path with no rollout plan, code added "for future flexibility" or symmetry. Raise YAGNI findings as `Category: YAGNI candidate` regardless of change size — they are advisory, listed in a separate section, and not corrected unless the user explicitly requests it. Cite the simpler form that would satisfy the same evidence and the trigger that would justify keeping the larger form.

### Step 3.4: Domain-scoped file lists

Pass each agent only the slice of the file list relevant to its domain:

| Agent | File-list slice |
|---|---|
| `junior-developer` | full file list (generalist) |
| `adversarial-security-analyst` | full file list plus dependency manifests |
| `test-engineer` | source files plus their related test files |
| `edge-case-explorer` | source files containing logic or input handling |
| `structural-analyst` | source files only (skip configs, schemas, docs) |
| `behavioral-analyst` | source files containing runtime logic |
| `concurrency-analyst` | source files matching the concurrency signal |
| `data-engineer` | schema, migration, query, ORM, and data-access files only |
| `devops-engineer` | infra, deploy, CI/CD, observability files only |

### Step 3.5: Dispatch

Launch all selected agents **in parallel** using the `Agent` tool with `run_in_background: true`, in a single message so they run concurrently. Each agent's prompt has three parts: the domain-specific question, the calibration directive verbatim from Step 3.3, and the domain-scoped file list from Step 3.4. Include the branch name only if one was detected (Mode A or Mode B). Do not wait for results — continue immediately to Step 4.

Domain-specific prompts (the `{size}`, `{N}`, `{change summary}`, `{file list}`, and `{branch}` placeholders are filled from earlier steps):

1. `test-engineer` — "Analyze test coverage for the following files{if branch available: ' on branch {branch}'}: {file list}. Focus your analysis on these files and their related test files. Write your output to {output_directory}/test-plan.md"

2. `edge-case-explorer` — "Explore edge cases for the following files{if branch available: ' on branch {branch}'}: {file list}. Focus your analysis on these files and their inputs, integration points, and error paths. Write your output to {output_directory}/edge-case-analysis.md"

3. `adversarial-security-analyst` — "Perform adversarial security analysis on the following files{if branch available: ' on branch {branch}'}: {file list}. Locate all dependency manifests in the project (package.json, requirements.txt, go.mod, Gemfile, *.lock, pom.xml, build.gradle) and include them in your analysis. Write your output to {output_directory}/security-analysis.md"

4. `structural-analyst` — "Analyze the static structure of the following files{if branch available: ' on branch {branch}'}: {file list}. Focus on coupling across module seams, dependency direction, duplication, and missing or leaky abstractions introduced or worsened by these changes. Write your output to {output_directory}/structural-analysis.md"

5. `behavioral-analyst` — "Analyze runtime behavior for the following files{if branch available: ' on branch {branch}'}: {file list}. Focus on data flow across module boundaries, error propagation and loss, state-management hazards, and integration-boundary assumptions that these changes introduce or break. Write your output to {output_directory}/behavioral-analysis.md"

6. `junior-developer` (artifact-review mode) — "Review the following files{if branch available: ' on branch {branch}'} as a respected junior-to-mid teammate reading this code for the first time: {file list}. Surface hidden assumptions, muddied scope, unclear naming, baked-in prerequisites, and places where the change conflicts with existing coding standards, ADRs, or CLAUDE.md. Every finding must cite a specific file and line and either name the assumption challenged or the standard violated. Write your output to {output_directory}/junior-developer-review.md"

7. `concurrency-analyst` — "Analyze concurrency and async patterns for the following files{if branch available: ' on branch {branch}'}: {file list}. Focus on race conditions, lock ordering, shared-resource contention, deadlock potential, and async error handling. Write your output to {output_directory}/concurrency-analysis.md"

8. `data-engineer` — "Audit the following data-related files{if branch available: ' on branch {branch}'}: {file list}. Focus on the data-engineering principles violated by what this change actually introduces — schema-design fit, index strategy, migration safety, query correctness, data-contract evolution. Apply the calibration directive: do not raise findings for benign-outcome concerns like duplicate-create-index attempts where the storage layer is naturally idempotent. Write your output to {output_directory}/data-analysis.md"

9. `devops-engineer` — "Audit the following infrastructure and deployment files{if branch available: ' on branch {branch}'}: {file list}. Focus on production-readiness concerns this change actually introduces — rollout safety, observability coverage, scale and cost impact, secret handling. Apply the calibration directive: do not raise findings for theoretical scale problems the project does not currently have. Write your output to {output_directory}/devops-analysis.md"

Continue to Step 4 immediately. Results will be collected in Step 7.

## Step 4: Review All Changes

Review each file from the Step 1 file list **in alphabetical order**. For each file:
1. **Skip generated files** (lock files, compiled output, vendor directories, auto-generated code) — note them as skipped in the review
2. **Skip binary files** — note them as skipped
3. **Read the full file** to understand context. For very large files (over 1000 lines), focus reads on the changed regions and their surrounding context
4. **Examine the diff** to understand what changed. If no diff is available (Mode B uncommitted review or Mode C non-git review from Step 1), skip this sub-step — the full file read from sub-step 3 provides all necessary context. Apply the review checklist to the entire file content.
5. **Apply the review checklist** at [review-checklist.md](references/review-checklist.md)

If the user provided focus areas in their arguments, apply extra scrutiny to those areas and include additional detail in findings for matching categories.

## Step 5: Documentation Compliance Analysis

After reviewing all changed files, analyze the changes against the project's documented patterns and conventions. **Skip this step if Step 1's project config lookup did not find any of the three directories (docs, ADR, coding standards).**

### Documentation Sources

| Source | Config Key | Category Prefix | Exclude Templates? |
|--------|-----------|----------------|-------------------|
| ADRs | ADR directory | [ADR: filename] | Yes |
| Coding Standards | coding standards directory | [Standard: filename] | Yes |
| General Docs | docs directory | [Docs: filename] | No |

For each source where Step 1's project config lookup returned a path:

1. Scan filenames in the directory to identify documents relevant to the changed files
2. Read each relevant document in full
3. Evaluate whether the changes contradict, circumvent, deviate from, or are inconsistent with the document
4. Report violations as review items using the category prefix from the table above

#### Compliance severity guidance

- **CRIT**: Directly contradicts or violates an accepted decision, standard, or documented convention
- **WARN**: Partially deviates or introduces a pattern not covered by existing documentation
- **SUGG**: Minor inconsistency with documented guidance

Documentation compliance findings merge into the same output sections as the file-by-file review findings.

## Step 6: Documentation Freshness Review

After the compliance analysis, evaluate whether documentation files are still accurate given the code changes. **Skip this step if Step 1's project config lookup did not find a docs directory.**

1. **Identify relevant docs** based on the domains, packages, and features touched by the diff
2. **Skip irrelevant docs**
3. **Read and evaluate each relevant doc** against the current state of the code. Look for:
   - Incorrect behavior descriptions
   - Stale references (renamed/moved/removed file paths, functions, fields)
   - Missing coverage for new features added by this branch
   - Incorrect code examples
4. **Report findings** using **[Docs Update: filename]** as the category prefix

Severity: **CRIT** if the doc describes behavior that is now wrong and would mislead developers. **WARN** if incomplete — a significant change should be documented. **SUGG** for minor staleness unlikely to cause confusion.

Documentation freshness findings merge into the same output sections as the other findings.

## Step 7: Collect and Classify Agent Results

Wait for all agents dispatched in Step 3 to complete. Each agent returns a summary with finding counts and a file path.

Read only the output files for agents that were actually dispatched in Step 3. Skip the read for any agent that was not selected:

- `{output_directory}/test-plan.md` — test-engineer findings (T-series)
- `{output_directory}/edge-case-analysis.md` — edge-case-explorer findings (EC-series)
- `{output_directory}/security-analysis.md` — adversarial-security-analyst findings (SEC-series)
- `{output_directory}/structural-analysis.md` — structural-analyst findings (S-series)
- `{output_directory}/behavioral-analysis.md` — behavioral-analyst findings (B-series)
- `{output_directory}/junior-developer-review.md` — junior-developer findings (JD-series)
- `{output_directory}/concurrency-analysis.md` — concurrency-analyst findings (C-series)
- `{output_directory}/data-analysis.md` — data-engineer findings (D-series)
- `{output_directory}/devops-analysis.md` — devops-engineer findings (DV-series)

Extract the items from the Findings sections of each file that was read. Then classify them as follows:

**Skip this step if no agents were dispatched in Step 3.**

Classify agent findings using the rubrics at [agent-finding-classification.md](references/agent-finding-classification.md). Continue task ID numbering sequentially from Steps 4-6 (see Task ID Assignment above).

### Deferred tests

If the test-engineer produced Deferred/Skipped items, include them as a note after the testing findings (not counted toward the cap):

> **Deferred tests:** The following test cases were considered but excluded because brittleness risk outweighs value: {list of skipped item titles and brief reasons}

## Step 8: Generate Review Output

Use the template at [template.md](references/template.md) for the output structure. Include all sections even when empty — the template shows the empty-state text for each. Include the Security Improvement Summary verbatim from the agent.

## Step 9: Verify Review Output

Before presenting the review, verify:

1. Task IDs are sequential within each category (CRIT-001, CRIT-002, ...; WARN-001, WARN-002, ...)
2. Agent findings from every dispatched agent (testing, edge-case, structural, behavioral, concurrency, data, devops, junior-developer) have valid task IDs continuing from manual review IDs. Findings from agents that were not dispatched in Step 3 must not appear.
3. Agent findings have valid `file_path:line_number` references
4. Deferred tests note is present if the test-engineer produced skipped items
5. The Review Summary table includes every finding and matches the detailed sections
6. All `file_path:line_number` references point to real files from the file list determined in Step 1
7. SEC-### IDs are sequential starting at SEC-001
8. Every SEC-### finding has an `EXPLOIT:` field populated
9. Every SEC-### finding has a corresponding CRIT-### cross-reference in `### 🔴 Critical`
10. Junior-developer findings that overlap with a specialist agent's finding reference the specialist finding instead of duplicating it
11. The review output is the COMPLETE and FINAL response. Do not append a trailing summary, commentary, sign-off, or follow-up message after the review. The structured review document IS the deliverable — nothing follows it.
12. The `### 🟡 YAGNI` section, when present, opens with the verbatim statement: *"These findings will not be corrected unless explicitly requested. They are documented so the team can decide consciously whether to keep, simplify, or defer the items."* YAGNI findings appear ONLY in this section — they are not duplicated under CRIT/WARN/SUGG and are not included in the Review Summary table.

