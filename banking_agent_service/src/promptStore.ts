'use strict';

/**
 * Prompt store — loads system prompts from JSON files in src/prompts/.
 * Each file is named by use case: banking.json, invest.json, default.json.
 *
 * Prompt format:
 *   { "system": "...", "userPrefix": "..." }
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

interface PromptDefinition {
  system: string;
  userPrefix?: string;
}

const _cache = new Map<string, PromptDefinition>();
const PROMPTS_DIR = join(__dirname, 'prompts');

export function getPrompt(useCase: string): PromptDefinition {
  if (_cache.has(useCase)) return _cache.get(useCase)!;

  const filePath = join(PROMPTS_DIR, `${useCase}.json`);
  if (existsSync(filePath)) {
    const def: PromptDefinition = JSON.parse(readFileSync(filePath, 'utf8'));
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
