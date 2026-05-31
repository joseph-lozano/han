#!/usr/bin/env node
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const sources = [
  ['han.core/skills', 'han.core/skills'],
  ['han.github/skills', 'han.github/skills'],
  ['han.reporting/skills', 'han.reporting/skills'],
  ['han.feedback/skills', 'han.feedback/skills'],
];
const outputRoot = path.join(repoRoot, 'pi', 'skills');

function splitFrontmatter(markdown, file) {
  if (!markdown.startsWith('---\n')) return null;
  const end = markdown.indexOf('\n---\n', 4);
  if (end === -1) throw new Error(`${file} has unterminated frontmatter`);
  return {
    frontmatter: markdown.slice(4, end),
    body: markdown.slice(end + 5),
  };
}

function normalizeSkillBody(body) {
  return body
    .replace(/model: "haiku"/g, 'model: "openai-codex/gpt-5.4-mini"')
    .replace(/model: "sonnet"/g, 'model: "openai-codex/gpt-5.5:low"')
    .replace(/model: "opus"/g, 'model: "openai-codex/gpt-5.5:xhigh"')
    .replace(/\bmodel: haiku\b/g, 'model: openai-codex/gpt-5.4-mini')
    .replace(/\bmodel: sonnet\b/g, 'model: openai-codex/gpt-5.5:low')
    .replace(/\bmodel: opus\b/g, 'model: openai-codex/gpt-5.5:xhigh')
    .replace(/\bsubagent_type: "han:([a-z0-9-]+)"/g, 'subagent_type: "han.$1"')
    .replace(/\bsonnet\b/g, 'openai-codex/gpt-5.5:low')
    .replace(/\bopus\b/g, 'openai-codex/gpt-5.5:xhigh')
    .replace(/\bhaiku\b/g, 'openai-codex/gpt-5.4-mini')
    .replace(/\bSonnet\b/g, 'openai-codex/gpt-5.5:low')
    .replace(/\bOpus\b/g, 'openai-codex/gpt-5.5:xhigh')
    .replace(/\bHaiku\b/g, 'openai-codex/gpt-5.4-mini');
}

function normalizeFrontmatter(frontmatter) {
  const lines = frontmatter.split('\n');
  const output = [];

  for (const line of lines) {
    if (line.startsWith('argument-hint:')) {
      const value = line.replace(/^argument-hint:\s*/, '').trim();
      output.push(`argument-hint: ${JSON.stringify(value.replace(/^['"]|['"]$/g, ''))}`);
      continue;
    }

    output.push(line);
  }

  return output.join('\n');
}

async function normalizeSkillFile(file) {
  const markdown = await readFile(file, 'utf8');
  const split = splitFrontmatter(markdown, file);
  if (!split) return;
  const frontmatter = normalizeFrontmatter(split.frontmatter, file);
  const body = normalizeSkillBody(split.body);
  await writeFile(file, `---\n${frontmatter}\n---${body}`);
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

let skillCount = 0;
for (const [sourceRelative, targetRelative] of sources) {
  const sourceDir = path.join(repoRoot, sourceRelative);
  const targetDir = path.join(outputRoot, targetRelative);
  await mkdir(path.dirname(targetDir), { recursive: true });
  await cp(sourceDir, targetDir, { recursive: true });

  const entries = await readdir(targetDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillFile = path.join(targetDir, entry.name, 'SKILL.md');
    try {
      await normalizeSkillFile(skillFile);
      skillCount += 1;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

console.log(`Generated ${skillCount} Pi skill directories in ${path.relative(repoRoot, outputRoot)}`);
