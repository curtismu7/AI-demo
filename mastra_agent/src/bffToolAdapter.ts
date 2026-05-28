import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export interface ToolSchema {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface RunCtx {
  bffToolUrl: string;
  bffInternalSecret: string;
  sessionId: string;
}

export class BffToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BffToolError';
  }
}

interface JsonSchemaProperty {
  type?: string;
}

interface JsonSchemaObject {
  properties?: Record<string, JsonSchemaProperty>;
}

export function buildBffTools(schemas: ToolSchema[], runCtx: RunCtx) {
  return schemas.map((schema) => _makeTool(schema, runCtx));
}

function _makeTool(schema: ToolSchema, runCtx: RunCtx) {
  const props = (schema.inputSchema as JsonSchemaObject).properties ?? {};
  const zodShape: Record<string, z.ZodTypeAny> = {};
  for (const [key, val] of Object.entries(props)) {
    zodShape[key] = val.type === 'number' ? z.number().optional() : z.string().optional();
  }

  const executeImpl = async (args: Record<string, unknown>) => {
    const resp = await fetch(runCtx.bffToolUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-gateway-secret': runCtx.bffInternalSecret,
        'x-session-id': runCtx.sessionId,
      },
      body: JSON.stringify({ tool: schema.name, args, sessionId: runCtx.sessionId }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new BffToolError(`BFF returned HTTP ${resp.status}: ${text.slice(0, 200)}`);
    }
    const data = (await resp.json()) as Record<string, unknown>;
    return (data.result as Record<string, unknown> | undefined) ?? data;
  };

  return createTool({
    id: schema.name,
    description: schema.description,
    inputSchema: z.object(zodShape),
    execute: async (inputData: Record<string, unknown>) => executeImpl(inputData),
  });
}
