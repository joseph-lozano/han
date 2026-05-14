# Pi Compatibility

Han is authored as a Claude Code plugin and packaged as a Pi package. When a Han skill runs in Pi, translate Claude Code-specific wording as follows.

## Agent dispatch

- Treat any instruction to use the `Agent` tool as an instruction to call Pi's `subagent(...)` tool from `pi-subagents`.
- For a single specialist, call `subagent({ agent: "agent-name", task: "..." })`.
- For a parallel swarm, call `subagent({ tasks: [{ agent: "agent-a", task: "..." }, ...], context: "fresh" })` unless the skill says another context is required.
- Preserve the skill's domain-scoped brief. Do not replace a detailed specialist prompt with a generic one.
- If a skill says to pass `model: "sonnet"`, `model: "opus"`, or `model: "haiku"`, preserve that model intent when the alias resolves in Pi. If it does not resolve, omit the model override and use the current Pi model.

## Tool names

Pi tool names are lowercase. Map Claude Code tool wording this way:

| Claude Code wording | Pi tool |
| --- | --- |
| `Read` | `read` |
| `Write` | `write` |
| `Edit` | `edit` |
| `Grep` | `grep` |
| `Glob` | `find` |
| `Bash(...)` | `bash` |

If a Claude-only tool is unavailable in Pi, use the nearest available Pi workflow. For example, use `bash`, `grep`, and `find` for file discovery when `Glob` is mentioned.

## Slash commands

Pi exposes skills as `/skill:name`. Han also ships prompt aliases so the Claude-style commands, such as `/code-review`, expand to a request to use the matching skill.
