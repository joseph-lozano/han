# Test Plan: Pi compatibility layer

## Scope

Analyzed branch `pi-compat` and the requested Pi compatibility files:

- `scripts/generate-pi-agents.mjs`
- `scripts/generate-pi-skills.mjs`
- `pi/extensions/han-pi-compat.ts`
- `package.json`

Existing test discovery found no project test suite, no test runner configuration, and no package scripts. The only related test-like artifact is the existing documentation folder `docs/plans/pi-compat-smoke-test/`. Because this package is Node/TypeScript-flavored and has no test dependencies, new tests should start with Node's built-in `node:test` plus `node:assert/strict`, and add only the minimum execution helper needed for TypeScript extension loading if the extension is tested directly.

Recent history: `git log --all -- scripts/generate-pi-agents.mjs scripts/generate-pi-skills.mjs pi/extensions/han-pi-compat.ts package.json` shows these files were introduced or changed in `a77c0eb Add Pi package compatibility`, with no corresponding tests found. That raises priority for smoke and contract tests around the generated Pi artifacts and extension registration.

## Summary

The Pi compatibility layer has no automated tests today, despite recently added scripts, runtime extension hooks, and package discovery metadata. The highest-value gaps are smoke/contract tests that verify generated agents and skills are Pi-usable, the extension installs and diagnoses agents correctly, and `package.json` points Pi at real extension and skill paths.

| Priority | Count |
|----------|-------|
| High     | 5     |
| Medium   | 2     |
| Low      | 0     |
| Skipped  | 4     |

Full analysis written to: docs/plans/pi-compat-smoke-test/test-plan.md

## Coverage Assessment

Current behavioral coverage is effectively zero. The repository contains generated Pi agents and skills, but no automated test verifies that the generators preserve the committed Pi contracts: agent namespace `han`, Pi model aliases, Pi tool names, copied skill directories, normalized model references, or quoted `argument-hint` frontmatter. The extension also has no automated coverage for its observable Pi API interactions: registering the before-agent-start hook, registering commands, copying generated agents into Pi-subagents discovery, reporting missing generated agents, or producing a doctor report.

The best first tests are narrow integration-style smoke tests using real temporary fixtures or the repository files. They should avoid brittle snapshots of whole generated files or full doctor output. Assertions should target stable behavioral contracts: presence of required frontmatter fields, absence of known Claude-only model aliases in generated Pi skill bodies, command registration names, copied markdown files, notification severity, and package paths that exist.

## Findings

**T1: Generated agent files have Pi-compatible frontmatter**
- **Priority:** High
- **Test level:** Integration
- **Entry point:** `scripts/generate-pi-agents.mjs:121` — top-level generator execution
- **Gap type:** Untested
- **Test approach:**
  - **Behavior:** Running the agent generator produces one Pi agent markdown file per `han.core/agents/*.md` source file, with Pi discovery metadata and converted Claude model/tool aliases.
  - **Stubs:** None. Use the real repository fixture because the generator currently has fixed repo-relative paths and the committed behavior is to generate this repo's Pi package artifacts.
  - **Input/Action:** Run `node scripts/generate-pi-agents.mjs` from the package root in an isolated working tree or with a backup/restore fixture around `pi/agents`.
  - **Expected output:** `pi/agents/*.md` exists for source agent files, each generated file starts with YAML frontmatter containing `package: han`, `systemPromptMode: replace`, `inheritProjectContext: true`, and `inheritSkills: false`; model values are Pi model IDs, not `haiku`, `sonnet`, or `opus`; tool values use Pi names such as `read`, `write`, `edit`, `find`, `grep`, `bash`, `web_search`, and `fetch_content` where the source declares Claude tools.
  - **Expected commands:** File writes to `pi/agents`. Verify generated files as the observable side effect, not internal write call counts.
- **Brittleness assessment:** Durable because it asserts the generated artifact contract Pi consumes, not helper function internals or exact whole-file snapshots. Avoid asserting frontmatter line order except where YAML parsing is unavailable and order is part of the generated file format.

**T2: Agent generator rejects source agents with unknown Claude model tiers**
- **Priority:** High
- **Test level:** Integration
- **Entry point:** `scripts/generate-pi-agents.mjs:94` — `convertModel`, observable through top-level execution at `scripts/generate-pi-agents.mjs:121`
- **Gap type:** Untested
- **Test approach:**
  - **Behavior:** A source agent declaring an unsupported `model:` tier fails generation instead of silently emitting a bad Pi model.
  - **Stubs:** Use a temporary copy of the repository or a fixture harness that can place a markdown file under `han.core/agents` with `model: bogus`. No filesystem API mocks are needed.
  - **Input/Action:** Run the generator against the fixture containing the invalid agent.
  - **Expected output:** Process exits non-zero or rejects with an error message naming the offending file and `unknown model tier`.
  - **Expected commands:** No need to verify partial write behavior. The behavioral contract is the surfaced error.
- **Brittleness assessment:** Durable because unknown model aliases are a realistic failure mode when new Claude Code agent metadata is added. Do not assert stack traces or exact Node error formatting.

**T3: Generated skill directories are copied and normalized for Pi**
- **Priority:** High
- **Test level:** Integration
- **Entry point:** `scripts/generate-pi-skills.mjs:69` — top-level generator execution
- **Gap type:** Untested
- **Test approach:**
  - **Behavior:** Running the skill generator recreates `pi/skills` from the four Han plugin skill roots and normalizes Pi-incompatible Claude model aliases and Han subagent names inside `SKILL.md` files.
  - **Stubs:** None for the main smoke test. Use real repository fixtures because `package.json` exposes these generated paths to Pi.
  - **Input/Action:** Run `node scripts/generate-pi-skills.mjs` from the package root in an isolated working tree or with backup/restore around `pi/skills`.
  - **Expected output:** The four expected generated roots exist under `pi/skills`; each copied skill with a source `SKILL.md` has a generated `SKILL.md`; generated bodies do not contain reachable model aliases `model: "haiku"`, `model: "sonnet"`, `model: "opus"`, `model: haiku`, `model: sonnet`, or `model: opus`; generated bodies convert `subagent_type: "han:name"` to `subagent_type: "han.name"`.
  - **Expected commands:** File tree replacement under `pi/skills`. Verify resulting files and directories, not internal `rm`, `cp`, or `writeFile` call counts.
- **Brittleness assessment:** Durable as a generated-artifact contract. Avoid asserting every global prose replacement because broad word-level replacement may be edited as compatibility guidance evolves; focus on model and subagent syntax that Pi actually consumes.

**T4: Pi extension registers compatibility guidance and commands**
- **Priority:** High
- **Test level:** Unit
- **Entry point:** `pi/extensions/han-pi-compat.ts:130` — default export `hanPiCompat(pi)`
- **Gap type:** Untested
- **Test approach:**
  - **Behavior:** Loading the extension registers the `before_agent_start` hook and both public Pi commands, and the hook appends Han Pi compatibility guidance to the existing system prompt.
  - **Stubs:** Provide a fake `ExtensionAPI` with `on` and `registerCommand` spies that record registered event names, command names, descriptions, and handlers. This is an outgoing command from the extension into Pi's registration API.
  - **Input/Action:** Import the extension, call the default export with the fake Pi API, then invoke the captured `before_agent_start` handler with `{ systemPrompt: "base" }`.
  - **Expected output:** Hook result contains `systemPrompt` beginning with `base` and including stable guidance clauses for Pi subagents, `han.project-manager`, Pi model IDs, tool mapping, and `${CLAUDE_SKILL_DIR}` handling.
  - **Expected commands:** `pi.on` receives `before_agent_start`; `pi.registerCommand` receives `han-pi-install-agents` and `han-pi-doctor`.
- **Brittleness assessment:** Registration names are the public Pi contract, so verifying them is legitimate. Do not assert exact call order or full guidance text; assert durable substrings that represent the compatibility behavior.

**T5: Agent install command copies generated markdown agents and reports success or missing sources**
- **Priority:** High
- **Test level:** Integration
- **Entry point:** `pi/extensions/han-pi-compat.ts:137` — `han-pi-install-agents` command handler
- **Gap type:** Untested
- **Test approach:**
  - **Behavior:** `/han-pi-install-agents` installs generated Han agent markdown files into Pi-subagents discovery and reports an actionable error when generated sources are unavailable or empty.
  - **Stubs:** Stub only the Pi command context `ctx.ui.notify` as a spy. Use a temporary `PI_CODING_AGENT_DIR` for the target directory. For source files, use either the real generated `pi/agents` directory for the success path or a controlled temporary package copy for missing/empty source scenarios.
  - **Input/Action:** Register the extension, invoke the captured `han-pi-install-agents` handler.
  - **Expected output:** On success, the target `agents/han` directory contains the same markdown filenames as the generated source directory. On empty source, no copy occurs and notification severity is `error`. On missing source directory, the handler rejects with an error instructing the operator to run `scripts/generate-pi-agents.mjs`.
  - **Expected commands:** `ctx.ui.notify` is called with an `info` success message including installed count and target path, or an `error` message for an empty source directory.
- **Brittleness assessment:** Durable because copying into Pi-subagents discovery is the command's core side effect. Avoid asserting copy order or exact prose beyond count, target path, and severity.

**T6: Doctor command reports installed/missing setup state from the filesystem**
- **Priority:** Medium
- **Test level:** Integration
- **Entry point:** `pi/extensions/han-pi-compat.ts:158` — `han-pi-doctor` command handler
- **Gap type:** Untested
- **Test approach:**
  - **Behavior:** `/han-pi-doctor` reports the active Pi agent directory, generated and installed agent counts, skill directory counts/missing status, and expected Pi package found/missing status.
  - **Stubs:** Stub `ctx.ui.notify` as a spy. Use a temporary `PI_CODING_AGENT_DIR` with controlled `agents/han` and `npm/node_modules` contents. Use the repository package root for source skill counts unless the test harness needs a temporary package copy.
  - **Input/Action:** Register the extension with the fake Pi API, invoke the captured `han-pi-doctor` handler.
  - **Expected output:** The notification body includes `Han Pi doctor`, the active Pi agent dir, generated source count, installed discovery target count, one line for each expected skill root, and found/missing package status for `pi-subagents`, `pi-web-access`, and `@juicesharp/rpiv-ask-user-question`.
  - **Expected commands:** `ctx.ui.notify` is called with severity `info` and the report string.
- **Brittleness assessment:** Medium brittleness because doctor output is operator-facing prose. Keep assertions to stable headings and data-bearing lines, not the full string or exact note wording.

**T7: Package manifest exposes real Pi extension and skill paths**
- **Priority:** Medium
- **Test level:** Integration
- **Entry point:** `package.json:12` — `pi` package metadata consumed by Pi package loading
- **Gap type:** Untested
- **Test approach:**
  - **Behavior:** The package manifest declares the Han Pi extension and all generated skill roots that Pi should load, and those paths exist in the repository artifact.
  - **Stubs:** None.
  - **Input/Action:** Read and parse `package.json`.
  - **Expected output:** `pi.extensions` contains `./pi/extensions/han-pi-compat.ts`; each `pi.skills` entry exists and is a directory; the extension path exists and is a file; `peerDependencies` includes `@earendil-works/pi-coding-agent` because the extension imports its `ExtensionAPI` type.
  - **Expected commands:** None.
- **Brittleness assessment:** Durable package contract test. It avoids speculative validation of every npm metadata field and focuses only on Pi discovery paths that would realistically break installation.

## Deferred / Skipped Tests

**S1: Exhaustive unit tests for every helper in `generate-pi-agents.mjs`**
- **Entry point:** `scripts/generate-pi-agents.mjs:29`
- **Reason:** Helper-level tests for `parseFrontmatter`, `unquote`, `splitTools`, `convertTool`, and `renderAgent` would be implementation-coupled because none are exported and the public behavior is the generated agent files. Reopen if these helpers are exported as a supported library API or if a real regression occurs that cannot be localized by the generated-artifact smoke test.

**S2: Exhaustive replacement matrix for every model alias casing in skill body prose**
- **Entry point:** `scripts/generate-pi-skills.mjs:26`
- **Reason:** The code does perform several replacements, but testing every word-level casing is mostly symmetry/completeness. The realistic production failure is Pi receiving unsupported model metadata or subagent syntax, covered by T3. Reopen if a source skill introduces a new reachable casing that breaks Pi execution.

**S3: Full snapshot/golden-file tests for generated agents, skills, or doctor output**
- **Entry point:** `scripts/generate-pi-agents.mjs:121`, `scripts/generate-pi-skills.mjs:69`, `pi/extensions/han-pi-compat.ts:92`
- **Reason:** Full snapshots would be brittle because Han agent and skill prose changes frequently and doctor notes are operator-facing text. The valuable contract is structural compatibility, not exact full text. Reopen only if Pi requires byte-for-byte generated files or a published external contract depends on exact doctor output.

**S4: Tests for hypothetical future plugin packages or future Pi package metadata fields**
- **Entry point:** `package.json:12`
- **Reason:** The manifest currently commits only to one extension and four skill roots. Tests for additional packages, semantic versioning, labels, distribution fields, or alternate Pi metadata would be speculative. Reopen when a real Pi package loader requirement, marketplace requirement, or user-described distribution need adds those fields.

## Coverage Estimate

After T1 through T7, behavioral coverage for the Pi compatibility layer would cover the main committed contracts: generation of Pi-compatible agents, generation of Pi-compatible skills, extension registration, runtime guidance injection, agent installation, doctor reporting, and package manifest discovery paths. Remaining untested behavior would mostly be intentionally deferred helper internals and exhaustive text replacement combinations whose failure modes are either covered by higher-level artifact tests or not yet evidenced by this codebase.
