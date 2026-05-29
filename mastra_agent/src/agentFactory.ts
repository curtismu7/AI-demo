import { Agent } from '@mastra/core/agent';
import { createOpenAI } from '@ai-sdk/openai';
import { buildBffTools, type ToolSchema, type RunCtx } from './bffToolAdapter';

const DEFAULT_INSTRUCTIONS =
  'You are a helpful banking assistant. Use the available tools to answer the user\'s questions.';

export interface LlmProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export function buildAgent(
  toolSchemas: ToolSchema[],
  runCtx: RunCtx,
  llm: LlmProviderConfig,
  instructions?: string,
): Agent {
  const tools = buildBffTools(toolSchemas, runCtx);

  const toolMap: Record<string, (typeof tools)[number]> = {};
  for (const tool of tools) {
    toolMap[tool.id] = tool;
  }

  // createOpenAI() with a baseURL points the OpenAI provider at any
  // OpenAI-compatible endpoint (LM Studio, Groq, Together, etc).
  const provider = createOpenAI({ baseURL: llm.baseUrl, apiKey: llm.apiKey });

  // provider(modelId) returns an AI SDK LanguageModel that Mastra's Agent
  // accepts at runtime, but its TS surface is DynamicArgument<MastraModelConfig>
  // which doesn't include the AI SDK type directly — cast through unknown.
  return new Agent({
    id: 'banking-agent',
    name: 'Banking Agent',
    instructions: instructions ?? DEFAULT_INSTRUCTIONS,
    model: provider(llm.model) as unknown as never,
    tools: toolMap,
  });
}
