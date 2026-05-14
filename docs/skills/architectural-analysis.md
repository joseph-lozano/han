# /architectural-analysis

Operator documentation for the `/architectural-analysis` skill in the han plugin. This document helps you decide *when* and *how* to use the skill. For what the skill does internally, read the skill definition at [`plugin/skills/architectural-analysis/SKILL.md`](../../plugin/skills/architectural-analysis/SKILL.md).

> See also: [Plugin landing page](../../README.md) · [All skills](./README.md) · [All agents](../agents/README.md)

## TL;DR

- **What it does.** Deep architectural analysis of a specified module, directory, or feature area: coupling, data flow, concurrency, risk, and SOLID alignment.
- **When to use it.** You want to assess the architecture, design quality, coupling, or technical debt of an existing part of the codebase. Before refactoring, during review, or to inform a decision.
- **What you get back.** A unified report with numbered findings from five specialist agents, a risk assessment, and architectural recommendations with pseudocode sketches for proposed interfaces.

## Key concepts

- **A focus area is required.** The skill must be pointed at a specific module, directory, or feature. *"Analyze the whole codebase"* is not a valid input. Ask a narrower question.
- **Five-agent fan-out.** `structural-analyst`, `behavioral-analyst`, and `concurrency-analyst` run in parallel. `risk-analyst` consumes their findings. `software-architect` synthesizes intra-codebase recommendations. A full audit dispatches five specialists. Cross-service / bounded-context concerns are deferred to `system-architect`, which you can dispatch separately.
- **Structural, behavioral, concurrency dimensions.** Structural covers module boundaries, coupling, dependency direction, abstractions, duplication. Behavioral covers data flow, error propagation, state management, integration boundaries. Concurrency covers race conditions, shared resource contention, deadlock potential, async error handling.
- **Numbered findings.** Each analyst returns findings with its own prefix (S1-SN structural, B1-BN behavioral, C1-CN concurrency, R1-RN risk). Cross-references survive into the recommendations so every proposed change traces to the finding that drove it.
- **Recommendations, not refactors.** The skill does not modify code. `software-architect` produces pseudocode sketches for proposed modules, interfaces, and boundaries inside the focus area. Implementation is a separate step.

## When to use it

**Invoke when:**

- A module or subsystem has grown organically and you want a principled baseline before refactoring.
- You are about to commit to a significant rewrite and want independent structural, behavioral, and concurrency analysis feeding the decision.
- Coupling, cohesion, or dependency direction feels wrong but you cannot point to the specific finding. The skill surfaces them concretely.
- A suspected concurrency issue exists somewhere in a module and needs multi-angle analysis (data flow + shared state + async handling) in one pass.
- You want SOLID-alignment recommendations with pseudocode sketches rather than prose generalities.
- A specialist (devops-engineer, data-engineer, security analyst) has flagged an architectural concern but you want the architectural analysis done independently and cross-referenced.

**Do not invoke for:**

- **Investigating a specific bug.** Use [`/investigate`](./investigate.md) for evidence-based root-cause work.
- **File-level correctness review.** Use [`/code-review`](./code-review.md) for per-file correctness, testing, and compliance.
- **Test planning.** Use [`/test-planning`](./test-planning.md) for a coverage-and-edge-case plan.
- **Creating new project structures or scaffolding.** This skill analyzes existing code. It does not design from scratch.
- **Documenting an existing module.** Use [`/project-documentation`](./project-documentation.md).
- **Architectural decision records.** Use [`/architectural-decision-record`](./architectural-decision-record.md) to capture a decision the architectural analysis motivated.

## How to invoke it

Run `/architectural-analysis` in Claude Code or Pi with a focus area.

Give it:

1. **A focus area (required).** A module directory, a specific subsystem, or a set of related files. If you run the skill without a focus area, it asks you to specify one before proceeding.
2. **A driving concern, optional.** *"I suspect the auth service's session handling has a race,"* or *"we want to split this module and need to see where the coupling lives first."* The concern biases the five specialists' attention without narrowing their scope.

Example prompts:

- `/architectural-analysis src/auth/`. Analyze the architecture of the auth module.
- `/architectural-analysis`. *"Evaluate the coupling and cohesion of the payment processing system."*
- `/architectural-analysis`. *"Check for architectural smells in the notification subsystem, particularly concurrency patterns around the retry queue."*
- `/architectural-analysis packages/billing/`. Focus on the billing package before we split it into two services.

## What you get back

A unified report presented in-channel with these sections:

- **Executive Summary.** The focus area analyzed, the three to five most critical findings across dimensions, the highest-impact recommendations, and an explicit note on any dimension that found no issues (for example, *"no concurrency patterns present"*).
- **Structural Analysis.** Full verbatim output from `structural-analyst`. S1-SN findings on module boundaries, coupling, dependency direction, abstractions, and duplication, with file paths and verbatim code.
- **Behavioral Analysis.** Full verbatim output from `behavioral-analyst`. B1-BN findings on data flow, error propagation, state management, and integration boundaries.
- **Concurrency Analysis.** Full verbatim output from `concurrency-analyst`. C1-CN findings on race conditions, shared resource contention, deadlock potential, and async error handling. If no concurrency patterns exist in the focus area, the analyst reports that explicitly rather than inventing findings.
- **Risk Assessment.** Numbered R1-RN items from `risk-analyst`, each cross-referencing upstream S/B/C findings with likelihood, severity, blast radius, and reversibility.
- **Software-Architecture Recommendations.** `software-architect` output: recommended changes aligned with high cohesion, loose coupling, and SOLID. Pseudocode sketches for proposed modules, interfaces, and boundaries inside the focus area. Each recommendation traces back to the S/B/C/R findings that drove it.
- **System-level concerns deferred (if any).** Findings `software-architect` flagged as crossing a service boundary, bounded-context seam, or trust boundary. Dispatch `system-architect` separately to get recommendations at that altitude.

Every finding is tied to a specific file and line. Every recommendation traces to one or more findings. If a dimension is genuinely clear (for example, no concurrency in a pure-functional module), the skill reports that. It does not fabricate findings to fill space.

## How to get the most out of it

- **Scope narrowly.** Analyzing a single module pays off. Analyzing "the whole codebase" flattens into shallow findings. If you have a large area, split it and run the skill on each subsystem.
- **Name the driving concern.** *"Concurrency around the retry queue"* focuses the three primary analysts without constraining their analyses.
- **Run `/project-discovery` first.** The skill uses project config (CLAUDE.md, project-discovery.md) to resolve conventions. Without discovery, the analysts fall back to surrounding-code inference.
- **Pair with `/architectural-decision-record`.** The recommendations often capture architectural decisions worth recording. Run `/architectural-decision-record` next to capture the rationale, alternatives considered, and the decision made.
- **Pair with `/investigate`** if an analyst finding reveals a concrete runtime bug worth rooting out.
- **Pair with `/iterative-plan-review`** after you draft the refactoring plan. The architectural analysis produces recommendations; the plan review stress-tests the plan that implements them.
- **Re-run after structural changes.** If you split a module or extract a service, re-run the skill against the new boundaries. Coupling and duplication findings frequently migrate.

## Cost and latency

The skill dispatches five specialist agents. The first three (`structural-analyst`, `behavioral-analyst`, `concurrency-analyst`) run in parallel. `risk-analyst` runs next consuming their findings. `software-architect` runs last consuming all upstream output. Agents run on their default models. For a medium-size module (a few thousand lines), expect a few minutes for the parallel pass plus sequential time for risk and synthesis. The skill is built for infrequent high-signal runs (refactoring decisions, architectural check-ins, pre-rewrite baselines), not for tight-loop iteration.

## In more detail

The skill walks a six-step process:

1. **Validate the focus area.** Confirm the specified module, directory, or files exist using Glob and Read. Identify the boundaries. If the focus area does not resolve, stop and ask you to clarify.
2. **Dispatch analysis agents in parallel.** `structural-analyst`, `behavioral-analyst`, `concurrency-analyst` run simultaneously, each given the focus area.
3. **Compile analysis results.** Collect all S1-SN, B1-BN, C1-CN items, preserving verbatim output.
4. **Dispatch risk analyst.** Pass the full verbatim output from all three analysts. `risk-analyst` produces R1-RN items that cross-reference upstream findings with likelihood, severity, blast radius, and reversibility.
5. **Dispatch software architect.** Pass the full verbatim output from all four upstream agents. `software-architect` produces recommended changes aligned with cohesion, coupling, and SOLID, with pseudocode sketches. System-level concerns are deferred (not absorbed). Dispatch `system-architect` separately if the focus area crosses a service or bounded-context seam.
6. **Produce final report.** Assemble the unified report with Executive Summary plus the four analyses plus Risk Assessment plus Recommendations.

## Sources

The skill's protocols are grounded in established architectural analysis and synthesis practice.

### Robert C. Martin: Clean Architecture and SOLID

Martin's SOLID principles (Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion) and the dependency rule of Clean Architecture are the citable framework for `software-architect`'s recommendations. Every proposed interface or boundary references the SOLID principle it upholds.

URL: https://cleancoders.com/

### Gregor Hohpe: Enterprise Integration Patterns

Hohpe and Woolf's catalogue of integration patterns (Message Channel, Router, Translator, Endpoint) frames the behavioral-analyst's integration-boundary findings. When the skill recommends an integration change, it names the pattern being introduced or replaced.

URL: https://www.enterpriseintegrationpatterns.com/

### Doug Lea: Concurrent Programming in Java

Lea's *Concurrent Programming in Java* established the taxonomy for shared-state concurrency hazards: races, deadlocks, starvation, live-lock, priority inversion. The concurrency-analyst names the specific hazard class in every finding.

URL: https://gee.cs.oswego.edu/dl/cpj/

### Sam Newman: Building Microservices

Newman's work on service boundaries, bounded contexts, and distributed-system failure modes informs the structural-analyst's module-boundary and coupling findings when the focus area crosses services.

URL: https://samnewman.io/books/building_microservices_2nd_edition/

### Eric Evans: Domain-Driven Design

Evans's ubiquitous-language and bounded-context framings are cited when a structural finding turns on a domain-model boundary. Tactical DDD patterns (aggregate, entity, value object, repository) appear in `software-architect` recommendations inside a single context. Strategic DDD patterns (context maps, integration relationships) appear in `system-architect` recommendations when the focus area crosses a context seam.

URL: https://www.domainlanguage.com/ddd/

## Related documentation

- [Plugin landing page](../../README.md). The front door. Start here if you arrived from outside the docs tree.
- [Skills Index](./README.md). All 15 skills, grouped by purpose.
- [`structural-analyst`](../agents/structural-analyst.md), [`behavioral-analyst`](../agents/behavioral-analyst.md), [`concurrency-analyst`](../agents/concurrency-analyst.md). The three parallel analysts.
- [`risk-analyst`](../agents/risk-analyst.md). The agent that scores the analysts' findings by likelihood, severity, blast radius, and reversibility.
- [`software-architect`](../agents/software-architect.md). The adversarial synthesis agent that produces intra-codebase recommendations and pseudocode sketches (dispatched by this skill).
- [`system-architect`](../agents/system-architect.md). The adversarial synthesis agent that produces cross-service / bounded-context recommendations (dispatch separately when the focus area crosses a service or context seam).
- [`/architectural-decision-record`](./architectural-decision-record.md). Record the architectural decisions the analysis motivates.
- [`/investigate`](./investigate.md). Run when a finding reveals a concrete runtime bug.
- [`/iterative-plan-review`](./iterative-plan-review.md). Stress-test the refactoring plan that implements the recommendations.
- [`SKILL.md` for /architectural-analysis](../../plugin/skills/architectural-analysis/SKILL.md). The internal process definition.
