// banking_agent_service/src/reasonRoute.ts
import type { Request, Response } from 'express';
import * as crypto from 'crypto';
import { reasonOnce } from './reasoningGraph';
import type { ReasonRequest } from './reasonContract';

const SHARED_SECRET_HEADER = 'x-internal-gateway-secret';

export function makeReasonHandler(internalSecret: string) {
  const secretBuf = Buffer.from(internalSecret || '');
  return async function reasonHandler(req: Request, res: Response): Promise<void> {
    // Constant-time comparison — short-circuit equality leaks per-byte timing.
    // Mirrors banking_api_server/routes/agentIdToken.js (/internal/id-token).
    const presented = req.headers[SHARED_SECRET_HEADER];
    const presentedBuf = typeof presented === 'string' ? Buffer.from(presented) : null;
    if (
      !internalSecret ||
      !presentedBuf ||
      presentedBuf.length !== secretBuf.length ||
      !crypto.timingSafeEqual(presentedBuf, secretBuf)
    ) {
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
