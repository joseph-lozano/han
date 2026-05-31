#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const sourceDir = path.join(repoRoot, 'han.core', 'agents');
const outputDir = path.join(repoRoot, 'pi', 'agents');

const MODEL_MAP = {
  haiku: 'openai-codex/gpt-5.4-mini',
  sonnet: 'openai-codex/gpt-5.5:low',
  opus: 'openai-codex/gpt-5.5:xhigh',
};

const TOOL_MAP = new Map([
  ['Read', 'read'],
  ['Write', 'write'],
  ['Edit', 'edit'],
  ['MultiEdit', 'edit'],
  ['Glob', 'find'],
  ['Grep', 'grep'],
  ['WebSearch', 'web_search'],
  ['WebFetch', 'fetch_content'],
  ['LS', 'ls'],
]);

function parseFrontmatter(markdown, file) {
  if (!markdown.startsWith('---\n')) {
    throw new Error(`${file} is missing YAML frontmatter`);
  }

  const end = markdown.indexOf('\n---\n', 4);
  if (end === -1) {
    throw new Error(`${file} has unterminated YAML frontmatter`);
  }

  const raw = markdown.slice(4, end);
  const body = markdown.slice(end + 5).replace(/^\n/, '');
  const data = {};

  for (const line of raw.split('\n')) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    data[key] = unquote(value.trim());
  }

  return { data, body };
}

function unquote(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function quoteYaml(value) {
  return JSON.stringify(String(value));
}

function splitTools(value) {
  const tools = [];
  let current = '';
  let depth = 0;

  for (const char of value) {
    if (char === '(') depth += 1;
    if (char === ')') depth = Math.max(0, depth - 1);
    if (char === ',' && depth === 0) {
      if (current.trim()) tools.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }

  if (current.trim()) tools.push(current.trim());
  return tools;
}

function convertTool(tool) {
  const bashMatch = tool.match(/^Bash(?:\(.+\))?$/);
  if (bashMatch) return 'bash';
  return TOOL_MAP.get(tool) ?? tool.toLowerCase();
}

function convertTools(value = '') {
  return [...new Set(splitTools(value).map(convertTool))].join(', ');
}

function convertModel(value, file) {
  if (!value) return undefined;
  if (!MODEL_MAP[value]) {
    throw new Error(`${file} uses unknown model tier: ${value}`);
  }
  return MODEL_MAP[value];
}

function renderAgent(data, body, sourceFile) {
  const model = convertModel(data.model, sourceFile);
  const tools = convertTools(data.tools);
  const frontmatter = [
    '---',
    `name: ${data.name}`,
    'package: han',
    `description: ${quoteYaml(data.description ?? '')}`,
    model ? `model: ${model}` : undefined,
    tools ? `tools: ${tools}` : undefined,
    'systemPromptMode: replace',
    'inheritProjectContext: true',
    'inheritSkills: false',
    '---',
  ].filter(Boolean).join('\n');

  return `${frontmatter}\n\n${body.trimEnd()}\n`;
}

await mkdir(outputDir, { recursive: true });
const files = (await readdir(sourceDir)).filter((file) => file.endsWith('.md')).sort();

for (const file of files) {
  const sourcePath = path.join(sourceDir, file);
  const markdown = await readFile(sourcePath, 'utf8');
  const { data, body } = parseFrontmatter(markdown, file);
  const rendered = renderAgent(data, body, file);
  await writeFile(path.join(outputDir, file), rendered);
}

console.log(`Generated ${files.length} Pi agent files in ${path.relative(repoRoot, outputDir)}`);
