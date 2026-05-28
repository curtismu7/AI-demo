import { type Request, type Response } from 'express';
import { randomUUID } from 'crypto';
import { buildAgent } from './agentFactory';
import { AGUIEmitter } from './aguiEmitter';
import { getConfig } from './config';
import { type ToolSchema, type RunCtx } from './bffToolAdapter';

function formatSse(event: Record<string, unknown>): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function handleRun(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const threadId = (body.threadId as string | undefined) ?? `t_${randomUUID().slice(0, 8)}`;
  const runId = (body.runId as string | undefined) ?? `r_${randomUUID().slice(0, 8)}`;
  const messages = (body.messages as Array<{ role: string; content: string }> | undefined) ?? [];
  const rawTools = (body.tools as Array<Record<string, unknown>> | undefined) ?? [];
  const ctx = (body.context as Record<string, unknown> | undefined) ?? {};

  const toolSchemas: ToolSchema[] = rawTools.map((t) => ({
    name: t.name as string,
    description: (t.description as string | undefined) ?? '',
    inputSchema: (t.inputSchema as Record<string, unknown> | undefined) ?? { type: 'object', properties: {} },
  }));

  const sessionId = (ctx.sessionId as string | undefined) ?? '';
  const cfg = getConfig();
  const runCtx: RunCtx = {
    bffToolUrl: (ctx.bffToolUrl as string | undefined) || cfg.bffToolUrl,
    bffInternalSecret: cfg.bffInternalSecret,
    sessionId,
  };
  const model = (ctx.model as string | undefined) ?? cfg.model;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const emitter = new AGUIEmitter(runId, threadId, async (event) => {
    res.write(formatSse(event));
  });

  try {
    await emitter.onRunStart();
    const agent = buildAgent(toolSchemas, runCtx, model);
    const userMessage =
      [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';

    const stream = await agent.stream(userMessage);
    let streaming = false;

    // textStream is a ReadableStream<string>; Node 18+ supports async iteration on it
    for await (const chunk of stream.textStream as unknown as AsyncIterable<string>) {
      if (!streaming) {
        await emitter.onLlmStart();
        streaming = true;
      }
      await emitter.onLlmToken(chunk);
    }

    if (streaming) await emitter.onLlmEnd();
    await emitter.onRunEnd();
  } catch (err) {
    await emitter.onError(err instanceof Error ? err : new Error(String(err)));
  } finally {
    res.end();
  }
}
