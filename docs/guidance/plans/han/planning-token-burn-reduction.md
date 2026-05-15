# Plan: Reduce token burn in `han:plan-a-feature`, `han:iterative-plan-review`, and `han:plan-implementation`

## Why

A single feature plan today produces ~400–600 KB of artifacts (e.g., `read-only-gear-view/` = 370 KB across 12 markdown files; `read-only-task-view/` and `comments/` similar). Token burn to *produce* those artifacts is multiples larger because every sub-agent re-reads the full spec + decision-log + team-findings + tech-notes + project context before writing.

This plan groups the high- and medium-impact reductions identified during a review of real planning artifacts produced by these skills. Target: **40–60% input-token reduction on a typical medium-sized feature plan** without significantly impacting output quality.

The three skills share enough structure that several changes apply to all three. Where a change is skill-specific it is called out explicitly.

---

## Section A — High-impact changes

### A1. Tier the roster by feature size

**Skills:** all three (`plan-a-feature`, `iterative-plan-review`, `plan-implementation`).

**Change:**

Add an explicit feature-size classification step before any agent is launched. Each skill performs the classification using signals it already discovers (spec coordinations, file-touch surface, integration boundaries, security surface, user-facing surface, T#-note count). Map size to a roster cap:

| Size | Signals | Roster cap | Round cap |
|---|---|---|---|
| Small | Single subsystem, no cross-service integration, no auth/PII, no data migration, behavioral surface fits in one tab/page | 2 agents (junior-developer + 1 chosen specialist) | 1 round |
| Medium | 2–3 subsystems, optional integration, may touch UX or rollout | 3–4 agents | up to 2 rounds |
| Large | Cross-service, security-sensitive, data ownership shifts, or user explicitly requests full team | current default (5–7 agents) | up to 3 rounds (was 4) |

The skill states the chosen size, the recommended team, and the round cap to the user in one line. The user can override before agents launch ("treat this as large").

**Why:** Current skills assume "large" by default. Even `iterative-plan-review`'s lightweight mode still launches the 3 mandatory agents.

**Risk:** Under-staffing a "small" plan that turns out to touch a security boundary. Mitigated by requiring user confirmation of the size and roster, and by retaining the user's right to add specialists.

**Files:**
- `plugins/han/skills/plan-a-feature/SKILL.md` — insert as new step between Step 5 and Step 6.
- `plugins/han/skills/iterative-plan-review/SKILL.md` — replace Step 2 (Lightweight vs Team) with the three-tier classification.
- `plugins/han/skills/plan-implementation/SKILL.md` — insert as new step between Step 3 and Step 4.

### A2. Domain-scoped briefs (section excerpts, not whole files)

**Skills:** all three.

**Change:**

When dispatching a sub-agent, pass only the spec sections relevant to its domain plus pointers to the rest. Concrete mapping:

| Specialist | Default sections passed |
|---|---|
| `user-experience-designer` | Outcome, Primary Flow, User Interactions, Edge Cases (UX rows only) |
| `adversarial-security-analyst` | Outcome, Coordinations, Edge Cases, any rows touching auth/PII/secrets |
| `devops-engineer` | Outcome, Coordinations, Out of Scope, Open Items |
| `structural-analyst` / `behavioral-analyst` / `concurrency-analyst` | Primary Flow, Coordinations, T# notes |
| `test-engineer` / `edge-case-explorer` | Outcome, Primary Flow, Alternate Flows, Edge Cases |
| `gap-analyzer` | Source spec/PRD + the spec under review |
| `junior-developer` | Outcome + first paragraph of every section (plain-language overview) |

The agent brief includes the rule "if you need a section that wasn't included, read the file at `{path}` and cite what you used." The decision log and team-findings are NOT pre-loaded into agent context unless the agent's domain owns them.

**Why:** Today every agent receives spec + decision-log + team-findings + tech-notes + discovery notes. For a medium plan that's ~30 KB × 7 agents × 2 rounds before any output is generated.

**Risk:** Agent misses cross-section context. Mitigated by keeping the file paths in the brief and instructing on-demand reads.

**Files:** the agent-dispatch sections of all three SKILL.md files (Step 6 in `plan-a-feature`, Step 5 in `iterative-plan-review`, Step 4 and Step 6 in `plan-implementation`).

### A3. Eliminate per-round `project-manager` facilitation

**Skills:** `plan-implementation` (primary); `iterative-plan-review` indirectly.

**Change:**

Replace per-round PM facilitation with deterministic aggregation done by the orchestrating skill itself:

1. Collect specialist outputs.
2. Group findings by category (assumption-refuted, overlap, ambiguity, edge-case, security, mechanic-leak).
3. Mark each claim `Evidenced` (cited file/line that resolves), `Anecdotal` (no citation), or `Disputed` (specialists disagree) using simple text rules.
4. Tag each finding `plan-level`, `spec-level`, or `T#-contradiction` from the finding's text.
5. Trip the spec-maturity gate using the existing thresholds.
6. Hand the aggregated, tagged result to the next iteration or to PM synthesis at the end.

`project-manager` is called **only** for:
- Final synthesis (Step 8 in `plan-implementation`, Step 8 in `plan-a-feature`).
- The single facilitation pass triggered when the spec-maturity gate trips.

**Why:** Each PM facilitation pass produces a 60+ KB summary that the synthesis pass then has to re-read. The mechanical aggregation work doesn't need an LLM.

**Risk:** Loss of PM's claim-ledger judgment between rounds. Mitigated because the deterministic aggregation still produces a claim ledger, just without LLM reasoning over edge cases. Edge cases (genuine specialist disagreement) still get surfaced to the user via the iteration loop.

**Files:**
- `plugins/han/skills/plan-implementation/SKILL.md` — rewrite Step 5 ("Round 1 — Project Manager Facilitation") and remove sub-step 3 of Step 6 (re-running PM facilitation each round). Keep the spec-maturity gate.
- The aggregation rules are simple enough to live inline in SKILL.md prose; if they grow, extract to `references/claim-aggregation-rules.md`.

### A4. Cap rounds with a deterministic stop

**Skills:** `iterative-plan-review`, `plan-implementation`.

**Change:**

Replace the current "80% chance of meaningful improvement" rule with a concrete stop condition:

> Stop when a round produces ≤ 2 new findings AND zero load-bearing findings. Load-bearing = security, T#-contradiction, missing coordination, missing edge case that blocks a primary-flow path.

Combined with the round caps from A1 (1 / 2 / 3 by size tier), this gives a hard upper bound and a typical case that exits early.

**Why:** "80% chance" is unfalsifiable and almost never trips in practice. Every plan I sampled ran to its maximum round budget.

**Risk:** Stop trips too early on a plan that would have benefited from another round. Mitigated by the "load-bearing" carve-out and by retaining the explicit user-can-continue option.

**Files:**
- `iterative-plan-review/SKILL.md` Step 4 (lightweight loop) and Step 5 (team rounds).
- `plan-implementation/SKILL.md` Step 6 (iteration loop).

### A5. Two-tier finding format

**Skills:** `plan-a-feature` (`team-findings.md`), `iterative-plan-review` (`review-findings.md`), `plan-implementation` (no separate findings file but the same format leaks into iteration-history).

**Change:**

Split findings into two classes with different templates:

**Major finding** (full template — current 9-field shape): for findings that change behavior, security, T#-contradictions, or load-bearing mechanics.

**Minor finding** (one-line bullet under `## Minor edits`): for wording, typos, naming, formatting, citation cleanups, missing punctuation. Format: `- F#: {one-line description} — {section changed}` and nothing else.

The agent classifies its own findings as it raises them (the brief instructs how). The orchestrator validates the classification — any finding with a security/coordination/T# keyword is forced to major.

**Why:** Roughly half the F# entries in the sampled plans are minor (e.g., F8 in `read-only-gear-view`: "List header actions are three, not four"). They currently consume the same template real estate as security findings.

**Risk:** Mis-classification hides a real finding under "minor." Mitigated by the keyword force-up rule and by keeping the `Changed in plan:` field in the minor format optional.

**Files:**
- `plan-a-feature/references/team-findings-template.md`
- `iterative-plan-review/references/review-findings-template.md`
- The Step prose in both skills that instructs how to write findings.

### A6. Fold the facilitation-summary file into iteration-history

**Skills:** `plan-implementation`.

**Change:**

Stop writing `implementation-facilitation-round-{N}.md` as a separate artifact. Each round's record lives entirely in `implementation-iteration-history.md` as a section:

```
## R{N}: {one-line round summary}
- Specialists engaged: {list}
- Claim ledger: {table or bullet list — Evidenced / Anecdotal / Disputed}
- Open Questions raised: {OQ list}
- Spec-maturity tags: {plan-level / spec-level / T#-contradiction counts}
- Next-step recommendation: {go to synthesis | continue iterating | blocked pending user | pause and sharpen spec}
- Decisions produced: {D# list, backfilled at synthesis}
- Changed in plan: {section list, backfilled at synthesis}
```

The current 60+ KB facilitation summary is largely a duplicate of consolidated findings + the recommendation; the consolidated findings already live in the findings file, and the recommendation collapses to one field.

**Why:** `read-only-gear-view/` shipped two facilitation summaries (65 KB + 35 KB) AND an iteration history. The summaries are read-once and never referenced afterward.

**Risk:** Loss of narrative context PM produces. Mitigated by keeping the claim ledger and Open Questions in the new structure; PM synthesis still gets the verbatim specialist outputs.

**Files:**
- `plan-implementation/SKILL.md` Step 5 and Step 6 (remove instruction to write facilitation summary).
- `plan-implementation/references/implementation-iteration-history-template.md` (extend to absorb the fields above).

---

## Section B — Medium-impact changes

### B1. Collapse the decision log for trivial decisions

**Skills:** `plan-a-feature` (`decision-log.md`), `plan-implementation` (`implementation-decision-log.md`).

**Change:**

Use the full `D#` template only for decisions that have either rejected alternatives, evidence beyond the user's request, or driving findings. Trivial decisions (those settled directly by the user's framing or by an obvious convention with no alternatives) collapse to a `## Settled by direct user input or obvious convention` bullet list at the top of the decision log:

```
- D8: Edit Mode button hidden for viewers (no manage permission). — Primary Flow B step 1
- D11: Edit Mode reuses today's inline-edit handlers unchanged. — Primary Flow B step 4
```

Skills still emit `D#` IDs so spec inline links remain stable; only the body shrinks.

**Why:** `read-only-gear-view/decision-log.md` has 30 D# entries × 30–40 lines each. Roughly a third of them have no rejected alternatives and resolve to "the user said so" or "the existing convention."

**Risk:** Future readers want the rationale for a "trivial" decision. Mitigated because the top of the decision log still lists every D# with its outcome; only the explanatory fields are dropped.

**Files:**
- `plan-a-feature/references/decision-log-template.md`
- `plan-implementation/references/implementation-decision-log-template.md`
- The Step prose in both skills that instructs how to record decisions.

### B2. Drop inline `([F#])` markers in the plan

**Skills:** `iterative-plan-review`.

**Change:**

Stop adding inline `([F#](artifacts/review-findings.md#f-N-...))` markers to the plan body when a non-obvious edit is driven by a finding. Keep the findings file's `Changed in plan:` field as the only forward link.

`([D#])` decision links in the spec stay — those are read by humans navigating the spec.

**Why:** No skill or agent currently parses these markers. They add noise to spec sentences and cost a write per finding. The reverse direction (`Changed in plan:` on each F#) already lets a reader trace from finding to plan.

**Risk:** A reader walking the spec from top to bottom no longer sees which sentences were finding-driven. Mitigated by keeping `Changed in plan:` searchable.

**Files:** `iterative-plan-review/SKILL.md` (multiple instances across Step 4, Step 5, Step 6 prose).

### B3. Make `feature-technical-notes.md` truly lazy across the workflow

**Skills:** `iterative-plan-review`, `plan-implementation`.

**Change:**

Today `plan-a-feature` lazily creates the file but `iterative-plan-review` and `plan-implementation` still mention it in agent briefs and synthesis prose even when it doesn't exist. Update both skills:

- Detect file presence at the start of the skill.
- Drop every brief sentence about T# notes from agent prompts when the file is absent.
- Drop "if it exists" qualifiers — replace with conditional inclusion.

**Why:** Reduces boilerplate in every agent brief by ~5 lines. Compounds across rounds.

**Files:**
- `iterative-plan-review/SKILL.md` (Step 1 spec-aware mode block, Step 5 brief).
- `plan-implementation/SKILL.md` (Step 1, Step 4, Step 8 — multiple references).

### B4. Single discovery, not per-agent rediscovery

**Skills:** `plan-implementation` (primary); `plan-a-feature` indirectly.

**Change:**

The orchestrator runs Step 2 discovery once and writes the result to `artifacts/.discovery-notes.md` (already happens in `read-only-task-view/`). Each agent brief includes a directive: **read the discovery notes; do not re-grep for what's already been found**.

**Why:** `read-only-task-view/artifacts/.discovery-notes.md` is 10 KB; without it, each of 7 specialists re-runs equivalent searches.

**Risk:** Discovery notes are stale or incomplete for a specific specialist's domain. Mitigated by keeping the agent's right to grep further if its domain needs something missing — but as a delta, not a re-run.

**Files:** `plan-implementation/SKILL.md` Step 2 (ensure write to disk) and Step 4 (instruct agents to read discovery notes first).

### B5. Drop `evidence-based-investigator` from the iterative-plan-review mandatory roster when no code claims exist

**Skills:** `iterative-plan-review`.

**Change:**

`evidence-based-investigator` becomes mandatory only when the plan contains explicit codebase claims (file paths, line numbers, function names, library mechanics). For UX-shape, architectural-decision, or pure-documentation plans, it drops from the mandatory three.

The skill detects "codebase claims" with a simple grep over the plan: presence of file-path-shaped tokens (`*.ts`, `*.go`, `*.svelte`, `src/...`), backticked function/class names, or line-number references like `:NNN`.

When it would otherwise be skipped, the skill states: "evidence-based-investigator is not required because the plan has no codebase claims to verify."

**Why:** EBI was the most-cited agent in `read-only-gear-view`'s findings (~30%) but is wasted on plans whose value is architectural or behavioral rather than codebase-grounded.

**Risk:** A plan with code claims that the heuristic misses ships without verification. Mitigated by erring toward inclusion (any single match keeps EBI in).

**Files:** `iterative-plan-review/SKILL.md` Step 3.

---

## Section C — Sequencing

The changes are listed in dependency order. Each block can be merged independently.

**Block 1 — Cheap structural cleanup (no behavior change):**
- A6 (fold facilitation summary)
- B2 (drop inline F# markers)
- B3 (lazy tech-notes consistency)

**Block 2 — Template tightening:**
- A5 (two-tier findings)
- B1 (collapse trivial decisions)

**Block 3 — Roster and discovery economy:**
- B4 (single discovery)
- B5 (conditional EBI mandatory)

**Block 4 — Process changes (highest impact, most risk):**
- A1 (size tiers)
- A2 (domain-scoped briefs)
- A4 (deterministic stop)

**Block 5 — Orchestration restructure:**
- A3 (eliminate per-round PM facilitation)

A3 should ship last because it interacts with A1's round caps and A4's stop rule, and because the deterministic aggregation logic needs to be solid before the LLM facilitator is removed.

---

## Section D — Validation

How we'll know if quality dropped after each block ships:

1. **Re-plan one of the existing reference features** (`google-maps-integration` is the smallest, `read-only-gear-view` is the most representative) using the updated skills.
2. **Diff the artifacts** against the originals — count F# entries, D# entries, total bytes, sub-agent invocations, total elapsed time.
3. **Spot-check for missing findings** — read the original findings file and check that every load-bearing finding (security, T#-contradiction, missing coordination) is still raised in the new run.
4. **User judgment on the spec/plan output quality** — does the user still feel the plan is sufficient to hand to implementation?

Pass criteria for each block: total artifact byte count drops by at least 15%, no load-bearing finding from the original run is missing in the new run, user accepts the spec/plan without explicit complaint about reduced rigor.

---

## Section E — Out of scope (deferred to a later pass)

- Lower-impact ideas from the original analysis: output budgets in agent prompts (#12), template field trimming (#13), one-shot self-review for lightweight mode (#14). These can land opportunistically.
- The cross-reference invariant rules across artifact files. Heavy but load-bearing for traceability.
- The spec-maturity gate. Quality-protective, leave alone.
- Sonnet-vs-opus model choices. Already correct.
