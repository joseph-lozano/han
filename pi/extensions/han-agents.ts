import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const TOOL_MAP: Array<[RegExp, string]> = [
  [/^Read$/i, "read"],
  [/^Write$/i, "write"],
  [/^Edit$/i, "edit"],
  [/^Grep$/i, "grep"],
  [/^Glob$/i, "find"],
  [/^Bash(?:\(.*\))?$/i, "bash"],
];

export default function hanAgents(_pi: any) {
  syncHanAgents();
}

function syncHanAgents(): void {
  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const sourceDir = path.join(packageRoot, "plugin", "agents");
  const targetDir = path.join(os.homedir(), ".pi", "agent", "agents", "han");

  if (!isDirectory(sourceDir)) return;

  fs.mkdirSync(targetDir, { recursive: true });

  const sourceFiles = fs.readdirSync(sourceDir)
    .filter((name) => name.endsWith(".md"))
    .sort();
  const expectedTargets = new Set(sourceFiles);

  for (const fileName of sourceFiles) {
    const sourcePath = path.join(sourceDir, fileName);
    const targetPath = path.join(targetDir, fileName);
    const source = fs.readFileSync(sourcePath, "utf8");
    const transformed = transformAgentForPi(source, fileName);
    writeIfChanged(targetPath, transformed);
  }

  for (const existing of safeReadDir(targetDir)) {
    if (!existing.endsWith(".md")) continue;
    if (!expectedTargets.has(existing)) fs.rmSync(path.join(targetDir, existing), { force: true });
  }
}

function transformAgentForPi(source: string, fileName: string): string {
  const match = source.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return source;

  const frontmatter = match[1].split("\n");
  const body = source.slice(match[0].length);
  const nextFrontmatter = frontmatter.map((line) => {
    if (!line.startsWith("tools:")) return line;
    return `tools: ${normalizeTools(line.slice("tools:".length))}`;
  });

  return [
    "---",
    ...nextFrontmatter,
    "---",
    `<!-- Managed by the han pi package. Source: plugin/agents/${fileName}. -->`,
    "",
    body.trimStart(),
  ].join("\n");
}

function normalizeTools(raw: string): string {
  const tools = new Set<string>();
  for (const token of raw.split(",")) {
    const value = token.trim();
    if (!value) continue;
    for (const [pattern, piTool] of TOOL_MAP) {
      if (pattern.test(value)) {
        tools.add(piTool);
        break;
      }
    }
  }
  return Array.from(tools).join(", ");
}

function writeIfChanged(filePath: string, content: string): void {
  if (fs.existsSync(filePath)) {
    const current = fs.readFileSync(filePath, "utf8");
    if (current === content) return;
  }
  fs.writeFileSync(filePath, content, "utf8");
}

function safeReadDir(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function isDirectory(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}
