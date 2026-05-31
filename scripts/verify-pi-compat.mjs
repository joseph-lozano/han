#!/usr/bin/env node
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const agentSourceDir = path.join(repoRoot, 'han.core', 'agents');
const generatedAgentDir = path.join(repoRoot, 'pi', 'agents');
const skillDirs = [
  'han.core/skills',
  'han.github/skills',
  'han.reporting/skills',
  'han.feedback/skills',
].map((dir) => path.join(repoRoot, dir));

const concreteModels = new Set([
  'openai-codex/gpt-5.4-mini',
  'openai-codex/gpt-5.5:low',
  'openai-codex/gpt-5.5:xhigh',
]);
const piTools = new Set(['read', 'write', 'edit', 'find', 'grep', 'bash', 'web_search', 'fetch_content', 'ls']);
const claudeToolPattern = /\b(Read|Write|Edit|MultiEdit|Glob|Grep|Bash|WebSearch|WebFetch|Agent|Task|Skill)\b/;

const warnings = [];
const errors = [];

async function existsDir(dir) {
  try {
    return (await stat(dir)).isDirectory();
  } catch {
    return false;
  }
}

async function walk(dir, predicate = () => true) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(filePath, predicate));
    else if (predicate(filePath)) files.push(filePath);
  }
  return files;
}

function parseFrontmatter(markdown, file) {
  if (!markdown.startsWith('---\n')) throw new Error(`${file} missing frontmatter`);
  const end = markdown.indexOf('\n---\n', 4);
  if (end === -1) throw new Error(`${file} has unterminated frontmatter`);
  const raw = markdown.slice(4, end);
  const data = {};
  for (const line of raw.split('\n')) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    data[match[1]] = unquote(match[2].trim());
  }
  return data;
}

function unquote(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function rel(file) {
  return path.relative(repoRoot, file);
}

function addWarning(file, line, code, message) {
  warnings.push({ file: rel(file), line, code, message });
}

async function verifyAgents() {
  if (!await existsDir(generatedAgentDir)) {
    errors.push(`Generated agent directory missing: ${rel(generatedAgentDir)}`);
    return;
  }

  const sourceAgents = (await readdir(agentSourceDir)).filter((name) => name.endsWith('.md')).sort();
  const generatedAgents = (await readdir(generatedAgentDir)).filter((name) => name.endsWith('.md')).sort();

  if (sourceAgents.length !== generatedAgents.length) {
    errors.push(`Agent count mismatch: source=${sourceAgents.length}, generated=${generatedAgents.length}`);
  }

  for (const source of sourceAgents) {
    if (!generatedAgents.includes(source)) errors.push(`Missing generated agent for ${source}`);
  }

  for (const file of generatedAgents) {
    const filePath = path.join(generatedAgentDir, file);
    const markdown = await readFile(filePath, 'utf8');
    let data;
    try {
      data = parseFrontmatter(markdown, rel(filePath));
    } catch (error) {
      errors.push(error.message);
      continue;
    }

    for (const key of ['name', 'package', 'description', 'model', 'tools', 'systemPromptMode', 'inheritProjectContext', 'inheritSkills']) {
      if (data[key] === undefined) errors.push(`${rel(filePath)} missing frontmatter key: ${key}`);
    }

    if (data.package !== 'han') errors.push(`${rel(filePath)} package should be han`);
    if (!concreteModels.has(data.model)) errors.push(`${rel(filePath)} has unexpected model: ${data.model}`);
    if (data.systemPromptMode !== 'replace') errors.push(`${rel(filePath)} systemPromptMode should be replace`);
    if (data.inheritProjectContext !== 'true') errors.push(`${rel(filePath)} inheritProjectContext should be true`);
    if (data.inheritSkills !== 'false') errors.push(`${rel(filePath)} inheritSkills should be false`);

    for (const tool of (data.tools ?? '').split(',').map((item) => item.trim()).filter(Boolean)) {
      if (!piTools.has(tool)) errors.push(`${rel(filePath)} has non-Pi tool name: ${tool}`);
    }
  }
}

async function scanSkills() {
  const files = [];
  for (const dir of skillDirs) {
    if (await existsDir(dir)) files.push(...await walk(dir, (file) => file.endsWith('.md')));
  }

  for (const file of files.sort()) {
    const lines = (await readFile(file, 'utf8')).split(/\r?\n/);
    lines.forEach((line, index) => {
      const lineNumber = index + 1;
      if (line.includes('${CLAUDE_SKILL_DIR}')) {
        addWarning(file, lineNumber, 'CLAUDE_SKILL_DIR', 'Resolve script/reference path relative to the active Pi skill directory.');
      }
      if (/model:\s*["']?(haiku|sonnet|opus)["']?/.test(line)) {
        addWarning(file, lineNumber, 'CLAUDE_MODEL_ALIAS', 'Map Han model tier to concrete Pi model ID or omit model when using generated han.* agents.');
      }
      if (/allowed-tools:/.test(line) && claudeToolPattern.test(line)) {
        addWarning(file, lineNumber, 'CLAUDE_ALLOWED_TOOLS', 'Pi skill loading may tolerate this as text, but these are Claude tool names.');
      }
      if (/\bAgent tool\b|\bAgent\b.*tool call|\bTask tool\b|run_in_background|subagent_type/.test(line)) {
        addWarning(file, lineNumber, 'CLAUDE_AGENT_DISPATCH', 'Use pi-subagents subagent calls with han.* runtime names in Pi.');
      }
      if (/\bWebSearch\b|\bWebFetch\b/.test(line)) {
        addWarning(file, lineNumber, 'CLAUDE_WEB_TOOL_NAME', 'Use web_search/fetch_content in Pi-facing instructions.');
      }
    });
  }
}

await verifyAgents();
await scanSkills();

console.log('Pi compatibility verification');
console.log(`Generated agents: ${(await readdir(generatedAgentDir)).filter((name) => name.endsWith('.md')).length}`);
console.log(`Errors: ${errors.length}`);
console.log(`Warnings: ${warnings.length}`);

if (errors.length > 0) {
  console.log('\nErrors:');
  for (const error of errors) console.log(`- ${error}`);
}

if (warnings.length > 0) {
  console.log('\nWarnings:');
  for (const warning of warnings) {
    console.log(`- ${warning.file}:${warning.line} [${warning.code}] ${warning.message}`);
  }
}

process.exit(errors.length > 0 ? 1 : 0);
