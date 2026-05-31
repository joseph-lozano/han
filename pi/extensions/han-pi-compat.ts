import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { access, mkdir, readdir, copyFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const extensionDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(extensionDir, "..", "..");
const sourceAgentsDir = path.join(packageRoot, "pi", "agents");
const activePiAgentDir = process.env.PI_CODING_AGENT_DIR || path.join(homedir(), ".pi", "agent");
const targetAgentsDir = path.join(activePiAgentDir, "agents", "han");
const expectedSkillDirs = [
  "han.core/skills",
  "han.github/skills",
  "han.reporting/skills",
  "han.feedback/skills",
];
const expectedPackages = [
  "pi-subagents",
  "pi-web-access",
  "@juicesharp/rpiv-ask-user-question",
];

const compatibilityGuidance = `Han Pi compatibility guidance:
- Han skills and agents were originally authored for Claude Code. Follow their intent, but translate Claude-specific mechanics to Pi.
- Agent dispatch: when a skill says to use the Agent tool, Task tool, subagent_type, or run_in_background, use the pi-subagents subagent tool instead. Use parallel subagent calls when the skill asks for concurrent Agent calls.
- Agent names: generated Han agents register with the han package namespace. Convert names like project-manager, codebase-explorer, and test-engineer to han.project-manager, han.codebase-explorer, and han.test-engineer when calling subagent.
- Model aliases: Claude model tiers map to this Pi setup as haiku→openai-codex/gpt-5.4-mini, sonnet→openai-codex/gpt-5.5:low, and opus→openai-codex/gpt-5.5:xhigh. If a skill says pass model: "sonnet", pass model: "openai-codex/gpt-5.5:low" or rely on the generated agent's own model when launching han.* agents.
- Tool names: Claude source tool names map to Pi tools as Read→read, Write→write, Edit/MultiEdit→edit, Glob→find, Grep→grep, Bash(...)→bash, WebSearch→web_search, and WebFetch→fetch_content. Treat allowed-tools frontmatter in Han skills as Claude-origin metadata, not literal Pi tool names.
- Skill script paths: Pi does not define CLAUDE_SKILL_DIR. When a Han skill references \${CLAUDE_SKILL_DIR}, resolve scripts and references relative to that skill's active directory instead of using the literal environment variable.
- Skill slash-command names: if a Han skill references another Han slash command, use Pi's loaded skill command form for that skill, preserving the requested workflow and arguments.`;

async function getMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort();
}

async function assertDirectory(dir: string, label: string): Promise<void> {
  try {
    const info = await stat(dir);
    if (!info.isDirectory()) {
      throw new Error(`${label} exists but is not a directory: ${dir}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`${label} does not exist: ${dir}. Run scripts/generate-pi-agents.mjs from the Han package root first.`);
    }
    throw error;
  }
}

async function directoryExists(dir: string): Promise<boolean> {
  try {
    return (await stat(dir)).isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function countMarkdownFiles(dir: string): Promise<number> {
  if (!await directoryExists(dir)) return 0;
  return (await getMarkdownFiles(dir)).length;
}

async function countSkills(dir: string): Promise<number> {
  if (!await directoryExists(dir)) return 0;
  const entries = await readdir(dir, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (await fileExists(path.join(dir, entry.name, "SKILL.md"))) count += 1;
  }
  return count;
}

function packagePath(packageName: string): string {
  return path.join(activePiAgentDir, "npm", "node_modules", ...packageName.split("/"));
}

async function buildDoctorReport(): Promise<string> {
  const generatedAgentCount = await countMarkdownFiles(sourceAgentsDir);
  const installedAgentCount = await countMarkdownFiles(targetAgentsDir);
  const skillCounts = await Promise.all(expectedSkillDirs.map(async (relativeDir) => {
    const absoluteDir = path.join(packageRoot, relativeDir);
    return { relativeDir, count: await countSkills(absoluteDir), exists: await directoryExists(absoluteDir) };
  }));
  const packageChecks = await Promise.all(expectedPackages.map(async (packageName) => {
    const installedPath = packagePath(packageName);
    return { packageName, installedPath, installed: await directoryExists(installedPath) };
  }));

  const lines = [
    "Han Pi doctor",
    "",
    `Package root: ${packageRoot}`,
    `Active Pi agent dir: ${activePiAgentDir}`,
    `PI_CODING_AGENT_DIR: ${process.env.PI_CODING_AGENT_DIR || "not set"}`,
    "",
    "Agents:",
    `- generated source (${sourceAgentsDir}): ${generatedAgentCount}`,
    `- installed discovery target (${targetAgentsDir}): ${installedAgentCount}`,
    installedAgentCount > 0 ? "- status: Han agents are installed in the active discovery target." : "- status: Han agents are missing. Run /han-pi-install-agents, then /reload if needed.",
    "",
    "Skills:",
    ...skillCounts.map(({ relativeDir, count, exists }) => `- ${relativeDir}: ${exists ? `${count} skills` : "missing"}`),
    "",
    "Expected Pi packages:",
    ...packageChecks.map(({ packageName, installed, installedPath }) => `- ${packageName}: ${installed ? "found" : "missing"} (${installedPath})`),
    "",
    "Notes:",
    "- In Orca, PI_CODING_AGENT_DIR points at an overlay. Install agents into the active overlay for the current session and into ~/.pi/agent for future non-overlay sessions if needed.",
    "- Canonical Han skill files are Claude Code-first. The compatibility extension translates Agent dispatch, model aliases, tool names, and CLAUDE_SKILL_DIR guidance at runtime.",
  ];

  return lines.join("\n");
}

export default function hanPiCompat(pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event) => {
    return {
      systemPrompt: `${event.systemPrompt}\n\n${compatibilityGuidance}`,
    };
  });

  pi.registerCommand("han-pi-install-agents", {
    description: "Install generated Han agents into Pi-subagents discovery",
    handler: async (_args, ctx) => {
      await assertDirectory(sourceAgentsDir, "Generated Han agent source directory");
      const files = await getMarkdownFiles(sourceAgentsDir);

      if (files.length === 0) {
        ctx.ui.notify(`No generated Han agents found in ${sourceAgentsDir}`, "error");
        return;
      }

      await mkdir(targetAgentsDir, { recursive: true });

      for (const file of files) {
        await copyFile(path.join(sourceAgentsDir, file), path.join(targetAgentsDir, file));
      }

      ctx.ui.notify(`Installed ${files.length} Han agents to ${targetAgentsDir}. Run /reload if pi-subagents was already loaded.`, "info");
    },
  });

  pi.registerCommand("han-pi-doctor", {
    description: "Check Han Pi compatibility setup",
    handler: async (_args, ctx) => {
      ctx.ui.notify(await buildDoctorReport(), "info");
    },
  });
}
