import { randomUUID } from 'crypto';

interface RpcLike {
  id?: unknown;
  params?: { correlationId?: unknown; initParams?: { correlationId?: unknown } };
}

export function correlationFromMessage(msg: RpcLike | undefined): string {
  const p = msg?.params?.correlationId;
  if (typeof p === 'string' && p) return p;
  const ip = msg?.params?.initParams?.correlationId;
  if (typeof ip === 'string' && ip) return ip;
  const id = msg?.id;
  if (typeof id === 'string' && id) return id;
  if (typeof id === 'number') return String(id);
  return randomUUID();
}
