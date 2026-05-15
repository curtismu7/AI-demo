'use strict';

/**
 * Prompt store — loads system prompts from JSON files in src/prompts/.
 * Each file is named by use case: banking.json, invest.json, default.json.
 *
 * Prompt format:
 *   { "system": "...", "userPrefix": "..." }
 */

import { readFileSync, existsSync } from 'fs';
import { join, resolve, sep } from 'path';

interface PromptDefinition {
  system: string;
  userPrefix?: string;
}

const _cache = new Map<string, PromptDefinition>();
const PROMPTS_DIR = join(__dirname, 'prompts');
const RESOLVED_PROMPTS_DIR = resolve(PROMPTS_DIR);

// CR-01: allowlist useCase tokens to prevent path traversal. Any input that
// doesn't match this shape falls through to the bundled `default` prompt.
const USE_CASE_RE = /^[a-z][a-z0-9_-]{0,31}$/;

export function getPrompt(useCase: string): PromptDefinition {
  // CR-01: validate input against allowlist before any filesystem access.
  if (typeof useCase !== 'string' || !USE_CASE_RE.test(useCase)) {
    if (useCase !== 'default') {
      console.warn(
        `[promptStore] Rejected non-allowlisted useCase; falling back to default. ` +
          `typeof=${typeof useCase} length=${typeof useCase === 'string' ? useCase.length : 'n/a'}`,
      );
      return getPrompt('default');
    }
    // useCase === 'default' but doesn't match regex (shouldn't happen) — fall through.
  }

  if (_cache.has(useCase)) return _cache.get(useCase)!;

  const filePath = join(PROMPTS_DIR, `${useCase}.json`);

  // CR-01: defense in depth — confirm the resolved path is still inside PROMPTS_DIR.
  const resolvedPath = resolve(filePath);
  if (
    resolvedPath !== RESOLVED_PROMPTS_DIR &&
    !resolvedPath.startsWith(RESOLVED_PROMPTS_DIR + sep)
  ) {
    console.warn(
      `[promptStore] Resolved prompt path escaped PROMPTS_DIR; falling back to default.`,
    );
    if (useCase !== 'default') return getPrompt('default');
    return { system: 'You are a helpful banking assistant.' };
  }

  if (existsSync(resolvedPath)) {
    const def: PromptDefinition = JSON.parse(readFileSync(resolvedPath, 'utf8'));
    _cache.set(useCase, def);
    return def;
  }

  // Fall back to default
  const defaultPath = join(PROMPTS_DIR, 'default.json');
  if (existsSync(defaultPath)) {
    const def: PromptDefinition = JSON.parse(readFileSync(defaultPath, 'utf8'));
    _cache.set(useCase, def);
    return def;
  }

  return { system: 'You are a helpful banking assistant.' };
}
