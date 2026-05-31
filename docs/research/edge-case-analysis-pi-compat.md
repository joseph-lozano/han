# Edge Case Analysis: Pi compatibility layer generators and extension

## Scope

Analyzed branch `pi-compat` with focus on:

- `scripts/generate-pi-agents.mjs`
- `scripts/generate-pi-skills.mjs`
- `pi/extensions/han-pi-compat.ts`
- `package.json`

Context checked:

- Source agent frontmatter under `han.core/agents/*.md`
- Source skill metadata and body references under `han*/skills/**/SKILL.md`
- Pi compatibility stakeholder summary at `docs/plans/pi-compat-smoke-test/stakeholder-summary.md`
- Git history for target files
- YAGNI rule at `han.core/references/yagni-rule.md`

No dedicated test files were found for the target files. `git log --all --oneline -- <target files>` shows one relevant commit: `a77c0eb Add Pi package compatibility`.

## Summary

Focused edge-case exploration found the highest-risk gaps around generated artifact drift, doctor checks looking at canonical skill directories instead of the Pi manifest paths, and uncaught filesystem failures during agent installation. No critical edge cases were found, but several high-priority cases can make Pi load stale, missing, or misleading compatibility artifacts without test coverage.

| Priority | Count |
|----------|-------|
| Critical | 0     |
| High     | 3     |
| Medium   | 4     |
| Low      | 1     |

Full analysis written to: docs/research/edge-case-analysis-pi-compat.md

## Input Source Map

| Input | Origin | Type | Validated? |
|-------|--------|------|------------|
| Agent markdown files | `han.core/agents/*.md`, read by `scripts/generate-pi-agents.mjs` | Markdown with simple YAML frontmatter | Partially. Requires LF `---` delimiters, parses only single-line `key: value`, errors on unknown `model` |
| Agent `model` frontmatter | `han.core/agents/*.md` | string tier: `haiku`, `sonnet`, `opus` | Yes for known tiers, throws for unknown |
| Agent `tools` frontmatter | `han.core/agents/*.md` | comma-separated string with optional `Bash(...)` | Partially. Splits commas outside parentheses and maps known tool names |
| Skill directories | `han.core/skills`, `han.github/skills`, `han.reporting/skills`, `han.feedback/skills` | directory tree copied to `pi/skills` | Existence not checked before `cp`; missing source fails script |
| Skill `SKILL.md` frontmatter | `han*/skills/*/SKILL.md` | Markdown frontmatter | Partially. Unterminated frontmatter throws; missing frontmatter silently skips normalization |
| Skill body text | `han*/skills/*/SKILL.md` | Markdown instructions | Regex-normalized for model words and one `subagent_type` shape |
| Pi manifest skill paths | `package.json` `pi.skills` | array of relative paths | Not validated in code |
| Extension event `systemPrompt` | Pi `before_agent_start` event | string from Pi runtime | Not validated |
| `PI_CODING_AGENT_DIR` | Environment variable read at extension module load | filesystem path string | Not validated beyond later filesystem operations |
| Generated agent source dir | `pi/agents`, read by `/han-pi-install-agents` and doctor | directory of `.md` files | Install command asserts directory; doctor counts missing as zero |
| Target agent install dir | `$PI_CODING_AGENT_DIR/agents/han` or `~/.pi/agent/agents/han` | filesystem directory | Created recursively; copy errors are not caught |
| Expected Pi packages | `$activePiAgentDir/npm/node_modules/{package}` | directories | Doctor only checks directory existence |

## Findings

### High Priority

**EC1: Removed or renamed source agents leave stale generated Pi agents**
- **Priority:** High
- **Dimension:** State dependency
- **Input:** Source agent file set from `han.core/agents/*.md`
- **Scenario:** A Han agent is renamed or removed, then `scripts/generate-pi-agents.mjs` is rerun. The script creates `pi/agents` but never clears old files, so stale agent files remain and can be installed by `/han-pi-install-agents`.
- **Code location:** `scripts/generate-pi-agents.mjs:121` and `scripts/generate-pi-agents.mjs:129` — creates and writes into `pi/agents` without removing prior output.
- **Current handling:** None. In contrast, the skill generator explicitly removes its output root at `scripts/generate-pi-skills.mjs:69`.
- **Expected behavior:** Generated agent output should reflect the source set exactly, or stale files should be detectable before installation.
- **Risk:** Pi-subagents can discover agents that no longer exist in canonical Han, causing wrong dispatch names, outdated instructions, or misleading doctor/install success.

**EC2: Doctor reports canonical skill directories, not the Pi skill directories the package actually loads**
- **Priority:** High
- **Dimension:** Integration boundary
- **Input:** Pi manifest skill paths and generated skill directories
- **Scenario:** `pi/skills/...` is missing, stale, or generation failed, while canonical `han.core/skills`, `han.github/skills`, `han.reporting/skills`, and `han.feedback/skills` still exist. `/han-pi-doctor` reports skills as present because it checks the canonical directories, but Pi loads skills from `package.json` paths under `pi/skills`.
- **Code location:** `pi/extensions/han-pi-compat.ts:12` and `pi/extensions/han-pi-compat.ts:95` through `pi/extensions/han-pi-compat.ts:97`; manifest paths are in `package.json:16` through `package.json:20`.
- **Current handling:** Doctor counts canonical skill directories only.
- **Expected behavior:** Doctor should validate the same paths advertised in the Pi manifest, or report both canonical and generated Pi-facing directories distinctly.
- **Risk:** A user can receive a healthy doctor report while Pi cannot load the generated skill copies or loads stale copies.

**EC3: Agent install command does not convert filesystem errors into actionable Pi notifications**
- **Priority:** High
- **Dimension:** Error propagation
- **Input:** Target install path from `PI_CODING_AGENT_DIR` or `~/.pi/agent`
- **Scenario:** The active Pi agent directory is unwritable, points into a missing or read-only overlay, or a target file cannot be overwritten. `mkdir` or `copyFile` throws inside the command handler.
- **Code location:** `pi/extensions/han-pi-compat.ts:148` and `pi/extensions/han-pi-compat.ts:150` through `pi/extensions/han-pi-compat.ts:151`.
- **Current handling:** No try/catch around install operations. Only empty source lists are converted to `ctx.ui.notify(..., "error")` at `pi/extensions/han-pi-compat.ts:143` through `pi/extensions/han-pi-compat.ts:145`.
- **Expected behavior:** Filesystem failures should surface as a clear error notification with the path and operation that failed.
- **Risk:** Installation can fail with a raw extension exception or ambiguous Pi error, leaving users without guidance and agents undiscoverable.

### Medium Priority

**EC4: Installed agent directory can retain stale agents after source generation changes**
- **Priority:** Medium
- **Dimension:** State dependency
- **Input:** Generated agent files copied into `$activePiAgentDir/agents/han`
- **Scenario:** `pi/agents` is corrected after an agent removal, but `/han-pi-install-agents` copies current files over the target without removing target files that are no longer present in the source.
- **Code location:** `pi/extensions/han-pi-compat.ts:148` through `pi/extensions/han-pi-compat.ts:151`.
- **Current handling:** Existing target directory is reused and files are overwritten one by one.
- **Expected behavior:** Install should either synchronize the target directory to the generated source set or doctor should warn about target files absent from source.
- **Risk:** Pi-subagents may continue discovering obsolete Han agents even after generation is fixed.

**EC5: Agent frontmatter parser silently accepts missing required fields and emits invalid metadata**
- **Priority:** Medium
- **Dimension:** External input
- **Input:** Agent frontmatter fields `name`, `description`, `tools`, and `model`
- **Scenario:** A source agent file with YAML frontmatter omits `name` or has a typo such as `nam:`. The generator writes `name: undefined` into the Pi agent file instead of failing.
- **Code location:** `scripts/generate-pi-agents.mjs:43` through `scripts/generate-pi-agents.mjs:50` parses only matching lines; `scripts/generate-pi-agents.mjs:107` emits `name: ${data.name}`.
- **Current handling:** Unknown model tiers throw at `scripts/generate-pi-agents.mjs:96` through `scripts/generate-pi-agents.mjs:98`; required field presence is not checked.
- **Expected behavior:** Required frontmatter fields should fail fast with the source file name.
- **Risk:** A malformed source agent can produce a generated agent that Pi-subagents cannot register correctly, or registers under a literal `undefined` name.

**EC6: Skill generation can leave package manifest paths missing when a source skill package directory is absent**
- **Priority:** Medium
- **Dimension:** Error propagation
- **Input:** Four hardcoded source directories in `scripts/generate-pi-skills.mjs`
- **Scenario:** A plugin directory is renamed, not checked out, or excluded from a distribution artifact. The script removes `pi/skills` first, then fails during `cp`, leaving the manifest paths in `package.json` pointing to a partially generated or absent tree.
- **Code location:** `scripts/generate-pi-skills.mjs:69` removes `pi/skills`; `scripts/generate-pi-skills.mjs:77` copies each source; manifest paths are `package.json:16` through `package.json:20`.
- **Current handling:** The copy error aborts the script. There is no preflight that all source directories exist before deleting prior output.
- **Expected behavior:** Preflight all source directories before destructive cleanup, or write to a temporary output root and swap only after successful generation.
- **Risk:** A failed generation attempt can break Pi skill loading for the whole package until generation is rerun successfully.

**EC7: `before_agent_start` guidance appends to possibly non-string system prompt**
- **Priority:** Medium
- **Dimension:** Integration boundary
- **Input:** Pi `before_agent_start` event `systemPrompt`
- **Scenario:** Pi passes an undefined, null, or otherwise non-string `systemPrompt` during a cold start or API change. Template interpolation produces a prompt beginning with `undefined` or `null`, or stringifies an unexpected object.
- **Code location:** `pi/extensions/han-pi-compat.ts:131` through `pi/extensions/han-pi-compat.ts:134`.
- **Current handling:** None.
- **Expected behavior:** Treat missing prompt as an empty string or fail clearly if Pi's event contract changed.
- **Risk:** Agents can receive polluted system instructions, making compatibility behavior harder to debug.

### Low Priority

**EC8: Skill body normalization only converts one Han subagent namespace shape**
- **Priority:** Low
- **Dimension:** Format mismatch
- **Input:** Skill body references to Han command and subagent names
- **Scenario:** Source skills contain `subagent_type: "han:project-manager"`, which is converted, but prose slash-command references such as `han:iterative-plan-review` and `han:plan-a-feature` remain Claude-style in generated skills. The extension guidance tells Pi to use Pi's loaded command form, but generated skill text still contains unconverted examples.
- **Code location:** `scripts/generate-pi-skills.mjs:34` converts only `subagent_type: "han:..."`; real source references appear in `han.core/skills/plan-a-feature/SKILL.md:275`, `han.core/skills/iterative-plan-review/SKILL.md:50`, and `han.core/skills/plan-implementation/SKILL.md:198`.
- **Current handling:** Runtime guidance in `pi/extensions/han-pi-compat.ts:31` tells the agent how to translate slash-command names.
- **Expected behavior:** Either the guidance remains sufficient and tested, or generated text is normalized consistently for the Pi command namespace once the exact Pi command shape is confirmed.
- **Risk:** Low because the guidance exists, but ambiguous generated prose can lead an agent to invoke a nonexistent command form.

## Coverage Summary

- Total edge cases discovered: 8
  - Critical: 0
  - High: 3
  - Medium: 4
  - Low: 1
- Edge cases already tested: none found. No dedicated `test` or `spec` files were located for the target scripts, extension, or manifest.
- Edge cases already handled in code but not tested:
  - Unknown agent model tier throws in `scripts/generate-pi-agents.mjs:96` through `scripts/generate-pi-agents.mjs:98`.
  - Missing generated agent source directory gets an actionable install error in `pi/extensions/han-pi-compat.ts:41` through `pi/extensions/han-pi-compat.ts:52`.
  - Empty generated agent source directory notifies the user in `pi/extensions/han-pi-compat.ts:143` through `pi/extensions/han-pi-compat.ts:145`.
  - Unterminated skill frontmatter throws in `scripts/generate-pi-skills.mjs:18` through `scripts/generate-pi-skills.mjs:19`.
- Edge cases with no handling and no tests: EC1, EC2, EC3, EC4, EC5, EC6, EC7.
- Dimensions skipped or only lightly explored in focused mode:
  - Numeric boundary values and date/time boundaries were skipped because the target code does not parse numeric ranges, dates, or times.
  - Unicode and adversarial user input were not actively hunted because the real inputs are repository-controlled markdown files and Pi runtime paths, not untrusted public input.
  - Concurrency/race windows were lightly considered but not raised beyond stale generated/installed state because these scripts and commands are normally operator-run, not shared mutable request paths.

## Dropped Edge Cases

- **CRLF-only frontmatter delimiter failure** — `parseFrontmatter` and `splitFrontmatter` require `---\n` delimiters at `scripts/generate-pi-agents.mjs:30` and `scripts/generate-pi-skills.mjs:17`. Dropped because repository source files are controlled in this project and currently use LF. Reopen if generated files start coming from Windows-authored external packages or if `.gitattributes` allows CRLF for markdown.
- **Malicious path traversal through agent file names** — source files come from `readdir(han.core/agents)` and only basename entries are written at `scripts/generate-pi-agents.mjs:122` through `scripts/generate-pi-agents.mjs:129`. Dropped because there is no external file-name input or archive extraction boundary. Reopen if agent sources are downloaded or unpacked from user-provided archives.
- **YAML multiline descriptions not parsed** — the agent frontmatter parser handles only single-line `key: value` at `scripts/generate-pi-agents.mjs:43` through `scripts/generate-pi-agents.mjs:48`. Dropped as a primary finding because current `han.core/agents/*.md` metadata uses single-line description fields. Reopen if agent descriptions move to block scalars or structured YAML.
- **Doctor false positive for package directories that exist but are broken packages** — `directoryExists` checks only directory presence at `pi/extensions/han-pi-compat.ts:55` through `pi/extensions/han-pi-compat.ts:60`. Dropped because the doctor is a setup smoke check, not a package manager verifier. Reopen if real user reports show directories present while Pi cannot load those packages.
