# Han Pi Compatibility

This directory contains the Pi compatibility layer for this Han fork. The canonical Han skills and agents remain Claude Code-first. Generated files under `pi/` make the suite loadable in Pi.

## What is generated

- `pi/agents/*.md` are Pi-subagents agent files generated from `han.core/agents/*.md`.
- `pi/skills/**/SKILL.md` are Pi-facing skill copies generated from the canonical Han skill directories.
- `pi/extensions/han-pi-compat.ts` registers compatibility guidance plus setup commands.

Do not hand-edit generated agents or skills unless you are intentionally testing a one-off change. Update the canonical Han files, then regenerate.

## Required Pi packages

Install these first:

```sh
pi install npm:pi-subagents
pi install npm:@juicesharp/rpiv-ask-user-question
pi install npm:pi-web-access
```

`pi-subagents` runs Han's specialist agents. `rpiv-ask-user-question` supports structured interviews. `pi-web-access` supports research flows.

## Local project install

From this repository root:

```sh
node scripts/generate-pi-agents.mjs
node scripts/generate-pi-skills.mjs
node scripts/verify-pi-compat.mjs
pi install ./ -l
```

Then restart Pi or run `/reload`, and run:

```text
/han-pi-install-agents
/han-pi-doctor
```

The project install writes `.pi/settings.json`, so only this workspace loads the local package.

## Global install

To install this fork globally from a local checkout:

```sh
pi install /absolute/path/to/han
```

For this checkout, that is currently:

```sh
pi install /Users/joseph/orca/workspaces/han/Pi-compat
```

To install from a git ref after pushing this fork:

```sh
pi install git:github.com/YOU/han@pi-compat
```

Then start a new Pi session, or run `/reload`, and run:

```text
/han-pi-install-agents
/han-pi-doctor
```

Global package installation loads the skills and extension. `/han-pi-install-agents` copies generated Han agents into the active Pi-subagents discovery directory.

## Orca overlay behavior

Inside Orca, Pi runs with `PI_CODING_AGENT_DIR` pointing at an Orca overlay, not directly at `~/.pi/agent`.

That means the active discovery target is:

```text
$PI_CODING_AGENT_DIR/agents/han
```

Outside an overlay, the fallback target is:

```text
~/.pi/agent/agents/han
```

Orca mirrors your Pi config when a terminal starts. If you install agents into `~/.pi/agent` after an Orca Pi terminal is already running, that existing terminal will not see them until you install into the active overlay or start a new Orca Pi terminal. `/han-pi-install-agents` handles this by writing to `PI_CODING_AGENT_DIR` when it is set.

## Updating from upstream Han

When this fork pulls upstream Han changes:

1. Merge or rebase upstream into the fork.
2. Regenerate Pi artifacts:

   ```sh
   node scripts/generate-pi-agents.mjs
   node scripts/generate-pi-skills.mjs
   node scripts/verify-pi-compat.mjs
   ```

3. Review the generated diff under `pi/agents` and `pi/skills`.
4. Start a fresh Pi session and run:

   ```text
   /han-pi-install-agents
   /han-pi-doctor
   ```

5. Smoke-test at least one self-contained skill and one subagent-heavy skill.

Keep canonical upstream files unchanged unless the change belongs in Han itself. Pi-only fixes should live in generators, generated artifacts, or `pi/extensions/han-pi-compat.ts`.

## Known warnings

Pi warns when a skill description exceeds 1024 characters. Han preserves the original descriptions because the warning does not prevent skill loading. Do not shorten descriptions just to silence the warning.

YAML parse errors do prevent skill loading. The Pi skill generator quotes known YAML-sensitive `argument-hint` values while preserving the rest of the frontmatter.

## Troubleshooting

### `/han-pi-doctor` is not found

The package extension is not loaded. Install the package and reload Pi:

```sh
pi install ./ -l      # project-local
# or
pi install /absolute/path/to/han
```

Then run `/reload` or start a fresh Pi session.

### Han agents are not visible

Run:

```text
/han-pi-install-agents
/han-pi-doctor
```

If you are inside Orca, confirm the doctor reports agents under `$PI_CODING_AGENT_DIR/agents/han`.

### Skills are missing

Regenerate Pi-facing skills and reload:

```sh
node scripts/generate-pi-skills.mjs
node scripts/verify-pi-compat.mjs
```

Then run `/reload`.

### A skill references `${CLAUDE_SKILL_DIR}`

Pi does not define that variable. The compatibility guidance tells Pi to resolve scripts relative to the active skill directory. If a specific skill still fails, patch the generated Pi skill copy through `scripts/generate-pi-skills.mjs` rather than editing canonical Han files.
