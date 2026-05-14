# Pi Compatibility

Han can be installed as a Pi package as well as a Claude Code plugin.

## Install

```bash
pi install git:github.com/testdouble/han
```

That one line installs the package from GitHub. On startup, Pi loads:

- Han skills from `plugin/skills/`
- prompt aliases from `prompts/`, so commands like `/code-review` work in Pi
- `pi-subagents`, installed as an npm dependency, which gives Han its specialist-agent dispatch tool
- a small Han extension that mirrors the packaged agent definitions into Pi's user agent directory

## Command names

In Claude Code, run Han skills as slash commands such as `/plan-a-feature`.

In Pi, you can use either form:

- `/plan-a-feature`, through Han's prompt alias
- `/skill:plan-a-feature`, through Pi's native skill command

Both forms tell the agent to load the same `SKILL.md` file.

## Agents

Pi's subagent extension discovers agents from `~/.pi/agent/agents/`. Han's Pi extension keeps `~/.pi/agent/agents/han/` synchronized with the packaged agent definitions and normalizes Claude Code tool names to Pi tool names. The mirrored agents keep Han's unqualified names, such as `project-manager` and `junior-developer`, so existing skill instructions can dispatch them directly.

If you remove Han from Pi and want to remove the mirrored agents too, delete:

```bash
rm -rf ~/.pi/agent/agents/han
```

## Local development

From a local checkout, install dependencies once, then install the package locally:

```bash
cd ./path/to/han
npm install
pi install .
```

Reload Pi after editing skills, prompts, or the Pi extension:

```text
/reload
```

For agent definition changes, the Han extension resynchronizes the mirrored agent files on the next Pi startup or reload.

## Related Documentation

- [README](../README.md). Main Han overview and installation paths.
- [Concepts](./concepts.md). The skill and agent model Han uses.
- [Skills Index](./skills/README.md). All Han skills.
- [Agents Index](./agents/README.md). All Han agents.
