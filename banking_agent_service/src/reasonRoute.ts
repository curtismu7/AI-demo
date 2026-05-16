// banking_agent_service/src/reasonRoute.ts
import type { Request, Response } from 'express';
import { reasonOnce } from './reasoningGraph';
import type { ReasonRequest } from './reasonContract';

const SHARED_SECRET_HEADER = 'x-internal-gateway-secret';

export function makeReasonHandler(internalSecret: string) {
  return async function reasonHandler(req: Request, res: Response): Promise<void> {
    const presented = req.headers[SHARED_SECRET_HEADER];
    if (!internalSecret || presented !== internalSecret) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    const body = req.body as ReasonRequest;
    if (!body || !Array.isArray(body.messages) || !Array.isArray(body.tools)) {
      res.status(400).json({ error: 'messages[] and tools[] required' });
      return;
    }
    try {
      const out = await reasonOnce(body);
      res.json(out);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Agent] reason error:', msg);
      res.status(500).json({ error: 'reason_failed', detail: msg });
    }
  };
}
