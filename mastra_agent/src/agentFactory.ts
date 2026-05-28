import { Agent } from '@mastra/core/agent';
import { buildBffTools, type ToolSchema, type RunCtx } from './bffToolAdapter';

const DEFAULT_INSTRUCTIONS =
  'You are a helpful banking assistant. Use the available tools to answer the user\'s questions.';

export function buildAgent(
  toolSchemas: ToolSchema[],
  runCtx: RunCtx,
  model: string,
  instructions?: string,
): Agent {
  const tools = buildBffTools(toolSchemas, runCtx);

  const toolMap: Record<string, (typeof tools)[number]> = {};
  for (const tool of tools) {
    toolMap[tool.id] = tool;
  }

  return new Agent({
    id: 'banking-agent',
    name: 'Banking Agent',
    instructions: instructions ?? DEFAULT_INSTRUCTIONS,
    model: model as Parameters<typeof Agent.prototype['stream']>[0] extends never ? never : string,
    tools: toolMap,
  });
}
