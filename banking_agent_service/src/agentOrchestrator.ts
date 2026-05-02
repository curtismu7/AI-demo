'use strict';

/**
 * Agent orchestrator — drives the LLM + MCP tool loop.
 *
 * Flow:
 *  1. Load system prompt for the use case
 *  2. Discover available tools from MCP Gateway (tools/list)
 *  3. Call LLM with system prompt + user message + tool definitions
 *  4. If LLM returns a tool_use call, invoke it via MCP Gateway and feed result back
 *  5. Repeat until LLM returns a final text message (no more tool calls)
 *
 * LLM providers supported: anthropic (default), openai, none (echo for testing).
 */

import axios from 'axios';
import { AgentConfig } from './config';
import { McpGatewayClient, McpGatewayError, ToolDefinition } from './mcpGatewayClient';
import { getPrompt } from './promptStore';

// ---------------------------------------------------------------------------
// Recovery error types — thrown by the tool loop, caught by the BFF (Wave 3)
// ---------------------------------------------------------------------------

export class LoginRequiredError extends Error {
  readonly requiredScopes: string[];
  readonly loginRequired = true as const;
  constructor(requiredScopes: string[]) {
    super('login_required');
    this.name = 'LoginRequiredError';
    this.requiredScopes = requiredScopes;
  }
}

export class HitlRequiredError extends Error {
  constructor(
    public readonly challengeId: string,
    public readonly challengeType: 'consent' | 'step_up',
    public readonly expiresAt: string,
  ) {
    super('hitl_required');
    this.name = 'HitlRequiredError';
  }
}

const MAX_TOOL_ITERATIONS = 10;

// ---------------------------------------------------------------------------
// Shared error mapping — called by both Anthropic and OpenAI tool loops
// ---------------------------------------------------------------------------

/**
 * Re-maps a recoverable `McpGatewayError` to a typed recovery error and throws it.
 * If the error is not a recognized recoverable code, it is re-thrown unchanged.
 * Always throws — the `never` return type lets callers omit an explicit `throw`.
 */
function mapMcpGatewayError(toolErr: McpGatewayError): never {
  const d = toolErr.data as Record<string, unknown> | undefined;
  if (toolErr.code === -32403) {
    throw new LoginRequiredError((d?.required_scopes as string[]) ?? []);
  }
  if (toolErr.code === -32002) {
    throw new HitlRequiredError(
      (d?.challengeId as string) ?? '',
      d?.challenge_type === 'step_up' ? 'step_up' : 'consent',
      (d?.expiresAt as string) ?? '',
    );
  }
  throw toolErr;
}

export interface AgentTaskRequest {
  userMessage: string;
  useCase?: string;
}

export interface AgentTaskResult {
  answer: string;
  toolCallCount: number;
  toolsUsed: string[];
}

export async function runAgentTask(
  request: AgentTaskRequest,
  mcpClient: McpGatewayClient,
  config: AgentConfig,
): Promise<AgentTaskResult> {
  const prompt = getPrompt(request.useCase || 'default');
  const tools = await mcpClient.listTools();

  if (config.llmProvider === 'none') {
    return _echoMode(request.userMessage, tools);
  }
  if (config.llmProvider === 'anthropic') {
    return _runAnthropic(request.userMessage, prompt.system, tools, mcpClient, config);
  }
  if (config.llmProvider === 'openai') {
    return _runOpenAI(request.userMessage, prompt.system, tools, mcpClient, config);
  }

  throw new Error(`Unknown LLM provider: ${config.llmProvider}`);
}

// ---------------------------------------------------------------------------
// Anthropic (claude-sonnet-4-6)
// ---------------------------------------------------------------------------

async function _runAnthropic(
  userMessage: string,
  systemPrompt: string,
  tools: ToolDefinition[],
  mcpClient: McpGatewayClient,
  config: AgentConfig,
): Promise<AgentTaskResult> {
  const anthropicTools = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema || { type: 'object', properties: {} },
  }));

  const messages: unknown[] = [{ role: 'user', content: userMessage }];
  let toolCallCount = 0;
  const toolsUsed: string[] = [];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: config.llmModel || 'claude-sonnet-4.6',
        max_tokens: 4096,
        system: systemPrompt,
        tools: anthropicTools,
        messages,
      },
      {
        headers: {
          'x-api-key': config.llmApiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        timeout: 60_000,
      },
    );

    const { content, stop_reason } = response.data;

    if (stop_reason === 'end_turn' || stop_reason === 'stop_sequence') {
      const textBlock = (content as any[]).find((b: any) => b.type === 'text');
      return { answer: textBlock?.text || '', toolCallCount, toolsUsed };
    }

    if (stop_reason === 'tool_use') {
      // Push assistant message
      messages.push({ role: 'assistant', content });

      // Execute all tool calls in this turn
      const toolResults: unknown[] = [];
      for (const block of content as any[]) {
        if (block.type !== 'tool_use') continue;
        toolCallCount++;
        toolsUsed.push(block.name);
        let result;
        try {
          result = await mcpClient.callTool(block.name, block.input || {});
        } catch (toolErr) {
          if (toolErr instanceof McpGatewayError) mapMcpGatewayError(toolErr);
          throw toolErr;
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result.content.map((c: any) => c.text).join('\n'),
          is_error: result.isError || false,
        });
      }

      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    // Unexpected stop_reason — return whatever content we have
    const textBlock = (content as any[]).find((b: any) => b.type === 'text');
    return { answer: textBlock?.text || JSON.stringify(content), toolCallCount, toolsUsed };
  }

  return { answer: 'Agent reached maximum tool iteration limit.', toolCallCount, toolsUsed };
}

// ---------------------------------------------------------------------------
// OpenAI
// ---------------------------------------------------------------------------

async function _runOpenAI(
  userMessage: string,
  systemPrompt: string,
  tools: ToolDefinition[],
  mcpClient: McpGatewayClient,
  config: AgentConfig,
): Promise<AgentTaskResult> {
  const openaiTools = tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema || { type: 'object', properties: {} },
    },
  }));

  const messages: unknown[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];
  let toolCallCount = 0;
  const toolsUsed: string[] = [];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      { model: config.llmModel || 'gpt-4o', messages, tools: openaiTools, tool_choice: 'auto' },
      {
        headers: { Authorization: `Bearer ${config.llmApiKey}`, 'Content-Type': 'application/json' },
        timeout: 60_000,
      },
    );

    const choice = response.data.choices[0];
    const assistantMsg = choice.message;
    messages.push(assistantMsg);

    if (choice.finish_reason === 'stop') {
      return { answer: assistantMsg.content || '', toolCallCount, toolsUsed };
    }

    if (choice.finish_reason === 'tool_calls' && assistantMsg.tool_calls) {
      for (const call of assistantMsg.tool_calls) {
        toolCallCount++;
        toolsUsed.push(call.function.name);
        const args = JSON.parse(call.function.arguments || '{}');
        let result;
        try {
          result = await mcpClient.callTool(call.function.name, args);
        } catch (toolErr) {
          if (toolErr instanceof McpGatewayError) mapMcpGatewayError(toolErr);
          throw toolErr;
        }
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: result.content.map((c: any) => c.text).join('\n'),
        });
      }
      continue;
    }

    return { answer: assistantMsg.content || '', toolCallCount, toolsUsed };
  }

  return { answer: 'Agent reached maximum tool iteration limit.', toolCallCount, toolsUsed };
}

// ---------------------------------------------------------------------------
// Echo mode (no LLM — returns tool list for testing)
// ---------------------------------------------------------------------------

function _echoMode(userMessage: string, tools: ToolDefinition[]): AgentTaskResult {
  return {
    answer: `[echo] Received: "${userMessage}". Available tools: ${tools.map((t) => t.name).join(', ')}.`,
    toolCallCount: 0,
    toolsUsed: [],
  };
}
